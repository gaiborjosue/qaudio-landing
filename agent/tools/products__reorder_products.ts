import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { saveProductOrder } from "../../lib/admin/product-order"
import { reorderProductsInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

export default defineTool({
  deferred: true,
  description:
    "Set the display order of one category's or one brand's products (or of every product, with neither slug). List every product in that set, drafts included, first shown first; products__list_catalog gives the current order and ids. The owner previews the shop listing and approves first.",
  inputSchema: reorderProductsInputSchema,
  approval: {
    request: always(),
    prompt: () => "Save this product order?",
  },
  label: {
    start: () => "Reorder products",
    complete: () => "Saved the product order",
  },
  async execute(input, ctx) {
    const { changed } = await saveProductOrder(
      callerSupabase(ctx),
      input,
      failure
    )
    return refreshAfterSave(ctx, {
      saved: true,
      changed,
      revalidate: ["catalog"],
    })
  },
})
