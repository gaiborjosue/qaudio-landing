import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { reorderProductsInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  description:
    "Set the display order of one category's or one brand's products (or of every product, with neither slug). List every product in that set, drafts included, first shown first; list_catalog gives the current order and ids. The owner previews the shop listing and approves first.",
  inputSchema: reorderProductsInputSchema,
  approval: {
    request: always(),
    prompt: () => "Save this product order?",
  },
  label: {
    start: () => "Reorder products",
    complete: () => "Saved the product order",
  },
  async execute({ category_slug, brand_slug, product_ids }, ctx) {
    const supabase = callerSupabase(ctx)
    let query = supabase.from("products").select("id, name, sort_order")
    if (category_slug) query = query.eq("category_slug", category_slug)
    if (brand_slug) query = query.eq("brand_slug", brand_slug)
    const { data: current, error } = await query
    if (error) throw failure("Products", error)

    const listed = new Set(product_ids)
    const missing = current.filter((product) => !listed.has(product.id))
    const known = new Set(current.map((product) => product.id))
    const extra = product_ids.filter((id) => !known.has(id))
    if (missing.length || extra.length || listed.size !== product_ids.length) {
      throw new Error(
        `Product order: list every product in this set exactly once.${
          missing.length
            ? ` Missing: ${missing.map((product) => product.name).join(", ")}.`
            : ""
        }${extra.length ? ` Not in this set: ${extra.join(", ")}.` : ""}`
      )
    }

    // Steps of 10 leave room to slot a product in later without renumbering.
    const sortOrder = new Map(
      current.map((product) => [product.id, product.sort_order])
    )
    const changes = product_ids
      .map((id, index) => ({ id, sort_order: (index + 1) * 10 }))
      .filter(({ id, sort_order }) => sortOrder.get(id) !== sort_order)
    const results = await Promise.all(
      changes.map(({ id, sort_order }) =>
        supabase
          .from("products")
          .update({ sort_order })
          .eq("id", id)
          .select("id")
      )
    )
    for (const result of results) {
      if (result.error) throw failure("Product order", result.error)
      if (result.data.length !== 1) {
        throw new Error(
          "Product order: a product wasn't updated. Read the catalog again."
        )
      }
    }
    return { saved: true, changed: changes.length, revalidate: ["catalog"] }
  },
})
