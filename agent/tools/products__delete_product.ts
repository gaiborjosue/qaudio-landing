import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { deleteProductInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Permanently delete a product and its photo list by id. To hide it but keep it, save it as a draft instead. The owner approves first.",
  inputSchema: deleteProductInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) => `Delete ${input.name} from the shop?`,
  },
  label: {
    start: ({ name }) => `Delete ${name}`,
    complete: (input) => `Deleted ${input.name}`,
  },
  async execute({ id }, ctx) {
    const supabase = callerSupabase(ctx)
    const { data, error } = await supabase
      .from("products")
      .delete()
      .eq("id", id)
      .select("id, slug")
    if (error) throw failure("Product", error)
    if (data.length === 0) {
      throw new Error("Product: nothing deleted; no product has that id.")
    }
    return { deleted: true, slug: data[0].slug, revalidate: ["catalog"] }
  },
})
