import type { SupabaseClient } from "@supabase/supabase-js"
import { RECORD_COLUMNS } from "../catalog-columns"
import { descriptionColumns, descriptionFromColumns } from "../catalog"
import type { Database } from "../supabase/database"
import type {
  ProductInput,
  ProductQuickEdit,
  ProductSaleInput,
} from "./schemas"
import { fromStoreDateTime, toStoreDateTime } from "./store-time"
import { placeUploads, type Fail } from "./uploads"

// Reading, saving, and deleting products, shared by the agent's read tool and
// the admin's Products tab (Server Actions). Both pass a client signed in as
// the admin, so RLS applies. Relative imports, because the agent imports this
// too.

type Supabase = SupabaseClient<Database>

/** A product with every field, its id, and its order. */
export type ProductRecord = ProductInput & { id: string; sort_order: number }

/** One product with every field and its photos in order, or null. */
export async function readProduct(
  supabase: Supabase,
  where: { id: string } | { slug: string },
  fail: Fail
): Promise<ProductRecord | null> {
  const query = supabase.from("products").select(RECORD_COLUMNS)
  const { data, error } = await (
    "id" in where ? query.eq("id", where.id) : query.eq("slug", where.slug)
  ).maybeSingle()
  if (error) throw fail("Product", error)
  if (!data) return null
  const {
    product_images,
    description_intro,
    features,
    description_closing,
    sale_price_cents,
    sale_starts_at,
    sale_ends_at,
    ...product
  } = data
  return {
    ...product,
    availability: product.availability as ProductInput["availability"],
    description: descriptionFromColumns({
      description_intro,
      features,
      description_closing,
    }),
    price_unit: product.price_unit as ProductInput["price_unit"],
    condition: product.condition as ProductInput["condition"],
    status: product.status as ProductInput["status"],
    sale:
      sale_price_cents !== null && sale_ends_at !== null
        ? {
            price_cents: sale_price_cents,
            starts_at: sale_starts_at && toStoreDateTime(sale_starts_at),
            ends_at: toStoreDateTime(sale_ends_at),
          }
        : null,
    images: product_images
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ path, alt, width, height, caption }) => ({
        path,
        alt,
        width,
        height,
        caption,
      })),
  }
}

/** A sale's columns, or cleared ones for null. */
function saleColumns(sale: ProductSaleInput | null) {
  return sale
    ? {
        sale_price_cents: sale.price_cents,
        sale_starts_at: sale.starts_at && fromStoreDateTime(sale.starts_at),
        sale_ends_at: fromStoreDateTime(sale.ends_at),
      }
    : { sale_price_cents: null, sale_starts_at: null, sale_ends_at: null }
}

/**
 * Adds a product, or replaces an existing one's fields and photos by id.
 * New photos (uploads/) are copied into products/ first; the photo list is
 * rewritten in order and trimmed. A sale is written only when given (null
 * ends it). Returns the id, slug, and saved photo paths.
 */
export async function saveProduct(
  supabase: Supabase,
  { id, images, description, sale, ...fields }: ProductInput,
  fail: Fail
) {
  // Move newly uploaded photos into products/ before any row points at them.
  const place = await placeUploads(
    supabase,
    images.map((image) => image.path),
    "products",
    fail
  )
  const row = {
    ...fields,
    name: fields.name.trim(),
    short_description: fields.short_description.trim(),
    ...descriptionColumns(description),
    ...(sale !== undefined && {
      ...saleColumns(sale),
      sale_news_post_id: null,
    }),
  }
  const result = id
    ? await supabase
        .from("products")
        .update(row)
        .eq("id", id)
        .select("id, slug")
    : await supabase.from("products").insert(row).select("id, slug")
  if (result.error) throw fail("Product", result.error)
  const product = result.data[0]
  if (!product) {
    throw new Error("Product: no product with that id; it may be deleted.")
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
        caption: image.caption ?? "",
      })),
      { onConflict: "product_id,sort_order" }
    )
    if (upserted.error) throw fail("Product photos", upserted.error)
  }
  const trimmed = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", product.id)
    .gte("sort_order", images.length)
  if (trimmed.error) throw fail("Product photos", trimmed.error)

  return {
    id: product.id,
    slug: product.slug,
    images: images.map((image) => place(image.path)),
  }
}

/** Short fields changed in the product table, each on its own product. */
export async function saveProductQuickEdits(
  supabase: Supabase,
  edits: ProductQuickEdit[],
  fail: Fail
) {
  const results = await Promise.all(
    edits.map(({ id, ...fields }) =>
      supabase.from("products").update(fields).eq("id", id).select("id")
    )
  )
  for (const result of results) {
    if (result.error) throw fail("Product", result.error)
    if (result.data.length !== 1) {
      throw new Error("Product: one of these products no longer exists.")
    }
  }
  return { saved: edits.length }
}

/**
 * Deletes a product by id; its photo rows go with it (the files stay in
 * storage). Returns false when no product has that id.
 */
export async function deleteProduct(
  supabase: Supabase,
  id: string,
  fail: Fail
) {
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .select("id")
  if (error) throw fail("Product", error)
  return data.length > 0
}
