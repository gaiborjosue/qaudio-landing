import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { saveProduct } from "../../lib/admin/product-save"
import { productInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Add a product, or replace an existing one's fields and photos by id. Send the complete record: every field and the full photo list in display order (omitted photos are removed from the product). The owner sees the product page preview and must approve before anything is saved.",
  inputSchema: productInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      input.id
        ? `Save changes to ${input.name}?`
        : `Add ${input.name} to the shop?`,
  },
  label: {
    start: ({ id, name }) => (id ? `Edit ${name}` : `Add ${name}`),
    complete: (input) => `Saved ${input.name}`,
  },
  async execute(input, ctx) {
    const saved = await saveProduct(callerSupabase(ctx), input, failure)
    return {
      saved: true,
      id: saved.id,
      slug: saved.slug,
      status: input.status,
      url: `/products/${saved.slug}`,
      // Saved photo paths; use these (not uploads/) in later edits.
      images: saved.images,
      revalidate: ["catalog"],
    }
  },
})
