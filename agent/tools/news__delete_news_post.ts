import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { deleteNewsPostInputSchema } from "../../lib/admin/schemas"
import { deleteNewsPost } from "../../lib/admin/news-save"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

export default defineTool({
  deferred: true,
  description:
    "Permanently delete a news post by id. To hide it but keep it, save it as a draft instead. Read the post first. When it has scheduled sale prices, ask the owner to keep or cancel those prices and include that sale_choice in the approval. The owner approves first.",
  inputSchema: deleteNewsPostInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `Delete the post “${input.title}”${input.sale_choice ? ` and ${input.sale_choice} its scheduled prices` : ""}?`,
  },
  label: {
    start: ({ title }) => `Delete “${title}”`,
    complete: (input) => `Deleted “${input.title}”`,
  },
  async execute(input, ctx) {
    const result = await deleteNewsPost(callerSupabase(ctx), input, failure)
    if (!result) {
      throw new Error("News post: nothing deleted; no post has that id.")
    }
    if ("needsSaleChoice" in result) {
      throw new Error(
        "Ask the owner whether to keep or cancel linked scheduled prices, then propose deletion with that choice."
      )
    }
    return refreshAfterSave(ctx, {
      deleted: true,
      slug: result.slug,
      cancelled: result.cancelled,
      revalidate: result.cancelled ? ["news", "catalog"] : ["news"],
    })
  },
})
