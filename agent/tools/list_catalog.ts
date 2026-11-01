import { defineTool } from "eve/tools"
import { z } from "zod"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  description:
    "List the shop's categories and brands (slug and name) and its products, including drafts, in the shop's display order, with optional filters. Use it to find a product's slug or id, valid category and brand slugs, and the current order.",
  inputSchema: z.object({
    search: z
      .string()
      .max(80)
      .optional()
      .describe("Part of a product name, case-insensitive."),
    category_slug: z.string().max(80).optional(),
    brand_slug: z.string().max(80).optional(),
    status: z.enum(["draft", "published"]).optional(),
  }),
  label: { start: () => "Read the catalog" },
  async execute(filters, ctx) {
    const supabase = callerSupabase(ctx)
    let products = supabase
      .from("products")
      .select(
        "id, slug, name, category_slug, brand_slug, price_cents, msrp_cents, price_unit, condition, status, sort_order"
      )
      // The shop's own order, so the list reads as the pages show it.
      .order("sort_order")
      .order("id")
      .limit(200)
    if (filters.search) {
      const escaped = filters.search.replace(/[\\%_]/g, (match) => `\\${match}`)
      products = products.ilike("name", `%${escaped}%`)
    }
    if (filters.category_slug)
      products = products.eq("category_slug", filters.category_slug)
    if (filters.brand_slug)
      products = products.eq("brand_slug", filters.brand_slug)
    if (filters.status) products = products.eq("status", filters.status)

    const [categories, brands, list] = await Promise.all([
      supabase
        .from("catalog_categories")
        .select("slug, name")
        .order("sort_order"),
      supabase.from("catalog_brands").select("slug, name").order("sort_order"),
      products,
    ])
    if (categories.error) throw failure("Categories", categories.error)
    if (brands.error) throw failure("Brands", brands.error)
    if (list.error) throw failure("Products", list.error)
    return {
      categories: categories.data,
      brands: brands.data,
      products: list.data,
    }
  },
})
