import { defineTool } from "eve/tools"
import { z } from "zod"
import { readProduct } from "../../lib/admin/product-save"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Read one product (draft or published) with every field and its photos in order, by slug or id. updated_at is its revision, for products__update_products.",
  inputSchema: z
    .object({
      slug: z.string().max(120).optional(),
      id: z.uuid().optional(),
    })
    .refine((input) => input.slug || input.id, "Give a slug or an id."),
  label: { start: ({ slug }) => (slug ? `Read ${slug}` : "Read a product") },
  async execute({ slug, id }, ctx) {
    const product = await readProduct(
      callerSupabase(ctx),
      id ? { id } : { slug: slug! },
      failure
    )
    return product ? { found: true, product } : { found: false }
  },
})
