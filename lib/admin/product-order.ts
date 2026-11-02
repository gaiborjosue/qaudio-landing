import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../supabase/database.types"
import type { ReorderProductsInput } from "./schemas"
import type { Fail } from "./uploads"

// Saving a product order, shared by the agent's products__reorder_products
// tool and the admin chat's "Save this order" (a Server Action). Both pass a
// client signed in as the admin, so RLS applies. Relative imports, because
// the agent imports this too.

/** The ids don't list the set's current products exactly once. */
export class ProductOrderMismatch extends Error {}

/**
 * Numbers one category's or brand's products (or every product, with neither
 * slug) 10, 20, 30… in the given order. The ids must list that whole set,
 * drafts included, exactly once. Database errors go through `fail`, so each
 * caller words them for its own reader.
 */
export async function saveProductOrder(
  supabase: SupabaseClient<Database>,
  { category_slug, brand_slug, product_ids }: ReorderProductsInput,
  fail: Fail
): Promise<{ changed: number }> {
  let query = supabase.from("products").select("id, name, sort_order")
  if (category_slug) query = query.eq("category_slug", category_slug)
  if (brand_slug) query = query.eq("brand_slug", brand_slug)
  const { data: current, error } = await query
  if (error) throw fail("Products", error)

  const listed = new Set(product_ids)
  const missing = current.filter((product) => !listed.has(product.id))
  const known = new Set(current.map((product) => product.id))
  const extra = product_ids.filter((id) => !known.has(id))
  if (missing.length || extra.length || listed.size !== product_ids.length) {
    throw new ProductOrderMismatch(
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
      supabase.from("products").update({ sort_order }).eq("id", id).select("id")
    )
  )
  for (const result of results) {
    if (result.error) throw fail("Product order", result.error)
    if (result.data.length !== 1) {
      throw new Error(
        "Product order: a product wasn't updated. Read the catalog again."
      )
    }
  }
  return { changed: changes.length }
}
