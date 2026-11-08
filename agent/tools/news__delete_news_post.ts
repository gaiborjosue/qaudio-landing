import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { deleteNewsPostInputSchema } from "../../lib/admin/schemas"
import { deleteNewsPost } from "../../lib/admin/news-save"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

export default defineTool({
  deferred: true,
  description:
    "Permanently delete a news post by id. To hide it but keep it, save it as a draft instead. The owner approves first.",
  inputSchema: deleteNewsPostInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) => `Delete the post “${input.title}”?`,
  },
  label: {
    start: ({ title }) => `Delete “${title}”`,
    complete: (input) => `Deleted “${input.title}”`,
  },
  async execute({ id }, ctx) {
    const slug = await deleteNewsPost(callerSupabase(ctx), id, failure)
    if (slug === null) {
      throw new Error("News post: nothing deleted; no post has that id.")
    }
    return refreshAfterSave(ctx, {
      deleted: true,
      slug,
      revalidate: ["news"],
    })
  },
})
