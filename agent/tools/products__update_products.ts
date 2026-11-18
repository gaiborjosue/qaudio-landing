import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { updateProducts } from "../../lib/admin/product-save"
import { updateProductsInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

const subject = (products: { name: string }[]) =>
  products.length === 1
    ? `“${products[0].name}”`
    : `${products.length} products`

// Anything the Products tab's form and table change, on one product or
// many at once, as a patch: only the given fields are written, and only on
// products unchanged since the agent read them. Sales and the shop order
// have their own tools.
export default defineTool({
  deferred: true,
  description:
    "Change products, one or many in one card: for each, its id, current name, and updated_at exactly as products__list_catalog or products__get_product gave them, and in changes only the fields that change (status draft hides it from the shop, published shows it; regular price_cents and msrp_cents in US cents; condition, condition_score, availability, audition, name, address, category, brand, unit, manufacturer page, card line, Markdown description, and the complete photo list). Fields left out stay as they are. Not for sales (products__save_sale) or the shop order (products__reorder_products). The owner sees each product's changes and approves first. It refuses products that changed since you read them; read them again. Use the returned updated_at for a later change.",
  inputSchema: updateProductsInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) => `Save changes to ${subject(input.products)}?`,
  },
  label: {
    start: (input) => `Change ${subject(input.products)}`,
    complete: (input) => `Saved changes to ${subject(input.products)}`,
  },
  async execute(input, ctx) {
    const saved = await updateProducts(callerSupabase(ctx), input, failure)
    const [only] = saved.length === 1 ? saved : []
    return refreshAfterSave(ctx, {
      saved: true,
      products: saved,
      ...(only && {
        url: `/products/${only.slug}`,
        live: only.status === "published",
      }),
      revalidate: ["catalog", "news"],
    })
  },
})
