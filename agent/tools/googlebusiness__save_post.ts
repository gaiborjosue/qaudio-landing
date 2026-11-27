import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { googleBusinessPostInputSchema } from "../../lib/admin/schemas"
import {
  prepareGoogleBusinessPost,
  saveGoogleBusinessPost,
} from "../../lib/admin/google-business-api"
import { googleBusinessAccess } from "../lib/google-business"
import { productSaleFlow } from "../lib/product-sale-flow"
import { idempotencyKey, uploadInstagramPhotos } from "../lib/instagram"
import { placeUploads } from "../lib/media"
import { callerSupabase } from "../lib/supabase"
import { retainInstagramMedia } from "../../lib/admin/media-lifecycle"
import {
  GOOGLE_BUSINESS_IMAGE,
  GOOGLE_BUSINESS_POST_LABELS,
} from "../../lib/admin/google-business-types"

export default defineTool({
  deferred: true,
  description:
    "Create a Google Business Update, native Offer or Event, or replace a Tune draft/scheduled post by id and revision. Offers and events require a title and start/end in window, separate from publication when. Use offer.redemption_url for an Offer link and call_to_action for other types. Optional single photo. Owner picks now, draft or schedule (up to 7 days) on the approval card. Writes and uploads require the server write opt-in.",
  inputSchema: googleBusinessPostInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `Save this Google ${GOOGLE_BUSINESS_POST_LABELS[input.kind]} for ${input.target.business}?`,
  },
  label: {
    start: () => "Save a Google Business post",
    complete: () => "Saved the Google Business post",
  },
  async execute(input, ctx) {
    const config = await googleBusinessAccess(ctx)
    const flow = productSaleFlow.get()
    if (flow.step === "google" && input.kind !== "offer")
      throw new Error(
        "The Product sale flow's Google step requires a native Offer."
      )
    if (
      flow.step === "google" &&
      input.photo &&
      input.photo.path !== flow.googleOfferImage
    )
      throw new Error(
        "Use this flow's dedicated Google Offer image, or propose a text-only Offer if the owner wants one."
      )
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
          ...GOOGLE_BUSINESS_IMAGE,
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
