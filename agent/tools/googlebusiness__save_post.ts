import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { googleBusinessPostInputSchema } from "../../lib/admin/schemas"
import {
  prepareGoogleBusinessPost,
  saveGoogleBusinessPost,
} from "../../lib/admin/google-business-api"
import { googleBusinessAccess } from "../lib/google-business"
import { idempotencyKey, uploadInstagramPhotos } from "../lib/instagram"
import { placeUploads } from "../lib/media"
import { callerSupabase } from "../lib/supabase"
import { retainInstagramMedia } from "../../lib/admin/media-lifecycle"

export default defineTool({
  deferred: true,
  description:
    "Create a standard Google Business update, or replace a Tune draft/scheduled post by id and revision. Text up to 1,500 characters, optional single photo and HTTPS call-to-action. Owner picks now, draft or schedule (up to 7 days) on the approval card. No events, offers or video yet. Writes and uploads are blocked in development.",
  inputSchema: googleBusinessPostInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `Save this Google Business post for ${input.target.business}?`,
  },
  label: {
    start: () => "Save a Google Business post",
    complete: () => "Saved the Google Business post",
  },
  async execute(input, ctx) {
    const config = await googleBusinessAccess(ctx)
    await prepareGoogleBusinessPost(config, input)
    let url: string | null = null
    const pending = `pending:${ctx.session.id}:${ctx.callId}`
    let path: string | null = null
    if (input.photo) {
      // Reuse the existing retained social-media store and JPEG pipeline.
      const supabase = callerSupabase(ctx)
      const place = await placeUploads(
        supabase,
        [input.photo.path],
        "instagram"
      )
      path = place(input.photo.path)
      await retainInstagramMedia(supabase, pending, [path])
      const urls = await uploadInstagramPhotos(
        config,
        [{ ...input.photo, path }],
        {
          width: 1200,
          height: 900,
          fit: "contain",
          background: "#ffffff",
        }
      )
      url = urls[0]
    }
    const saved = await saveGoogleBusinessPost(
      config,
      {
        ...input,
        ...(input.photo && path && { photo: { ...input.photo, path } }),
      },
      idempotencyKey(ctx),
      url
    )
    if (path) {
      await retainInstagramMedia(callerSupabase(ctx), saved.id, [path])
      await retainInstagramMedia(callerSupabase(ctx), pending, [])
    }
    if (!path) await retainInstagramMedia(callerSupabase(ctx), saved.id, [])
    return saved
  },
})
