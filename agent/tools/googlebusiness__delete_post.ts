import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { deleteGoogleBusinessPostInputSchema } from "../../lib/admin/schemas"
import { deleteGoogleBusinessPost } from "../../lib/admin/google-business-api"
import { googleBusinessAccess } from "../lib/google-business"
import { idempotencyKey } from "../lib/instagram"
import { retainInstagramMedia } from "../../lib/admin/media-lifecycle"
import { callerSupabase } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Delete a Tune Google Business draft, scheduled, failed or cancelled post after approval. Copy target, id and revision from current reads. Published posts must be removed in Google Business. Requires the server write opt-in in any environment.",
  inputSchema: deleteGoogleBusinessPostInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `Delete the Google Business post “${input.summary}” for ${input.target.business}?`,
  },
  label: {
    start: () => "Delete a Google Business post",
    complete: () => "Deleted the Google Business post",
  },
  async execute(input, ctx) {
    const saved = await deleteGoogleBusinessPost(
      await googleBusinessAccess(ctx),
      input,
      idempotencyKey(ctx)
    )
    await retainInstagramMedia(callerSupabase(ctx), input.id, [])
    return saved
  },
})
