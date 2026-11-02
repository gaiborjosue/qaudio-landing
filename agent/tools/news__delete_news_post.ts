import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { deleteNewsPostInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"

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
    const supabase = callerSupabase(ctx)
    const { data, error } = await supabase
      .from("news_posts")
      .delete()
      .eq("id", id)
      .select("id, slug")
    if (error) throw failure("News post", error)
    if (data.length === 0) {
      throw new Error("News post: nothing deleted; no post has that id.")
    }
    return { deleted: true, slug: data[0].slug, revalidate: ["news"] }
  },
})
