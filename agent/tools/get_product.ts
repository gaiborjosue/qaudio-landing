import { defineTool } from "eve/tools"
import { z } from "zod"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  description:
    "Read one product (draft or published) with every field and its photos in order, by slug or id. Read it before editing, then send the full updated record to save_product.",
  inputSchema: z
    .object({
      slug: z.string().max(120).optional(),
      id: z.uuid().optional(),
    })
    .refine((input) => input.slug || input.id, "Give a slug or an id."),
  label: { start: ({ slug }) => (slug ? `Read ${slug}` : "Read a product") },
  async execute({ slug, id }, ctx) {
    const supabase = callerSupabase(ctx)
    let query = supabase.from("products").select(
      `id, slug, category_slug, brand_slug, name, short_description,
        description_intro, features, description_closing, price_cents,
        msrp_cents, price_unit, condition, ready_for_audition,
        manufacturer_url, status, sort_order,
        product_images(path, alt, width, height, sort_order)`
    )
    query = id ? query.eq("id", id) : query.eq("slug", slug!)
    const { data, error } = await query.maybeSingle()
    if (error) throw failure("Product", error)
    if (!data) return { found: false }
    const { product_images, ...product } = data
    return {
      found: true,
      product: {
        ...product,
        images: product_images
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(({ path, alt, width, height }) => ({
            path,
            alt,
            width,
            height,
          })),
      },
    }
  },
})
