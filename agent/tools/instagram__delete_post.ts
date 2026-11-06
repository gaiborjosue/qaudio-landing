import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { deleteInstagramPost } from "../../lib/admin/instagram-posts"
import { deleteInstagramPostInputSchema } from "../../lib/admin/schemas"
import { instagramAccess } from "../lib/instagram"
import { retainInstagramMedia } from "../../lib/admin/media-lifecycle"
import { callerSupabase } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Delete one of this site's unpublished Instagram posts (a draft, a scheduled post, or a failed one) from Zernio by id, so it never goes out. A post already on Instagram can't be deleted here; the owner removes it in the Instagram app. The owner approves first.",
  inputSchema: deleteInstagramPostInputSchema,
  approval: {
    request: always(),
    prompt: () => "Delete this Instagram post from Zernio?",
  },
  label: {
    start: () => "Delete an Instagram post",
    complete: () => "Deleted the Instagram post",
  },
  async execute({ id }, ctx) {
    const result = await deleteInstagramPost(await instagramAccess(ctx), id)
    await retainInstagramMedia(callerSupabase(ctx), id, [])
    return result
  },
})
