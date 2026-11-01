import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { productInputSchema } from "../../lib/admin/schemas"
import { placeUploads } from "../lib/media"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
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
  async execute({ id, images, ...fields }, ctx) {
    const supabase = callerSupabase(ctx)
    // Move newly uploaded photos into products/ before any row points at them.
    const place = await placeUploads(
      supabase,
      images.map((image) => image.path),
      "products"
    )
    const row = {
      ...fields,
      name: fields.name.trim(),
      short_description: fields.short_description.trim(),
      description_intro: fields.description_intro.trim(),
      description_closing: fields.description_closing.trim(),
    }
    const result = id
      ? await supabase
          .from("products")
          .update(row)
          .eq("id", id)
          .select("id, slug")
      : await supabase.from("products").insert(row).select("id, slug")
    if (result.error) throw failure("Product", result.error)
    const product = result.data[0]
    if (!product) {
      throw new Error(
        "Product: no product with that id. Look it up again with list_catalog."
      )
    }

    // Photos are keyed by position, so an upsert rewrites each slot in place
    // and the delete trims slots past the new list.
    if (images.length > 0) {
      const upserted = await supabase.from("product_images").upsert(
        images.map((image, sort_order) => ({
          product_id: product.id,
          sort_order,
          path: place(image.path),
          alt: image.alt.trim(),
          width: image.width,
          height: image.height,
        })),
        { onConflict: "product_id,sort_order" }
      )
      if (upserted.error) throw failure("Product photos", upserted.error)
    }
    const trimmed = await supabase
      .from("product_images")
      .delete()
      .eq("product_id", product.id)
      .gte("sort_order", images.length)
    if (trimmed.error) throw failure("Product photos", trimmed.error)

    return {
      saved: true,
      id: product.id,
      slug: product.slug,
      status: fields.status,
      url: `/products/${product.slug}`,
      // Saved photo paths; use these (not uploads/) in later edits.
      images: images.map((image) => place(image.path)),
      revalidate: ["catalog"],
    }
  },
})
