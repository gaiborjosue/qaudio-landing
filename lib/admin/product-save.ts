import type { SupabaseClient } from "@supabase/supabase-js"
import { RECORD_COLUMNS } from "../catalog-columns"
import { descriptionColumns, descriptionFromColumns } from "../catalog"
import type { Database } from "../supabase/database"
import { productUpdate } from "./product-changes"
import type {
  ProductInput,
  ProductQuickEdit,
  ProductSaleInput,
  UpdateProductsInput,
} from "./schemas"
import { fromStoreDateTime, toStoreDateTime } from "./store-time"
import { placeUploads, type Fail } from "./uploads"

// Reading, saving, and deleting products, shared by the agent's products__
// tools and the admin's Products tab (Server Actions). Both pass a client
// signed in as the admin, so RLS applies. Relative imports, because the
// agent imports this too.

type Supabase = SupabaseClient<Database>

/** A product with every field, its id, its order, and when it last changed. */
export type ProductRecord = ProductInput & {
  id: string
  sort_order: number
  updated_at: string
}

const RECORD = `${RECORD_COLUMNS}, updated_at` as const

/** One product with every field and its photos in order, or null. */
export async function readProduct(
  supabase: Supabase,
  where: { id: string } | { slug: string },
  fail: Fail
): Promise<ProductRecord | null> {
  const query = supabase.from("products").select(RECORD)
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

/** The product field a column belongs to. */
const columnField = (column: string) =>
  column.startsWith("description_") || column === "features"
    ? "description"
    : column.startsWith("sale_")
      ? "sale"
      : column

/**
 * Rewrites a product's photo list in order: photos are keyed by position,
 * so an upsert rewrites each slot in place and the delete trims slots past
 * the new list.
 */
async function writePhotos(
  supabase: Supabase,
  productId: string,
  images: ProductInput["images"],
  place: (path: string) => string,
  fail: Fail
) {
  if (images.length > 0) {
    const upserted = await supabase.from("product_images").upsert(
      images.map((image, sort_order) => ({
        product_id: productId,
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
    .eq("product_id", productId)
    .gte("sort_order", images.length)
  if (trimmed.error) throw fail("Product photos", trimmed.error)
}

/**
 * Adds a product, or replaces an existing one's fields and photos by id.
 * New photos (uploads/) are copied into products/ first; the photo list is
 * rewritten in order and trimmed. A sale is written only when given (null
 * ends it). With `only`, an edit writes just those fields (and photos only
 * when they're among them), so changes made elsewhere meanwhile stay.
 * Returns the id, slug, and saved photo paths.
 */
export async function saveProduct(
  supabase: Supabase,
  { id, images, description, sale, ...fields }: ProductInput,
  fail: Fail,
  only?: ReadonlySet<string>
) {
  const partial = !!id && !!only
  const photos = !partial || only.has("images")
  // Move newly uploaded photos into products/ before any row points at them.
  const place = photos
    ? await placeUploads(
        supabase,
        images.map((image) => image.path),
        "products",
        fail
      )
    : (path: string) => path
  const full = {
    ...fields,
    name: fields.name.trim(),
    short_description: fields.short_description.trim(),
    ...descriptionColumns(description),
    ...(sale !== undefined && {
      ...saleColumns(sale),
      sale_news_post_id: null,
    }),
  }
  const row = partial
    ? Object.fromEntries(
        Object.entries(full).filter(([column]) => only.has(columnField(column)))
      )
    : full
  const result = id
    ? await supabase
        .from("products")
        .update(
          // Photos alone still mark the product as changed.
          Object.keys(row).length > 0
            ? row
            : { updated_at: new Date().toISOString() }
        )
        .eq("id", id)
        .select("id, slug")
    : await supabase.from("products").insert(full).select("id, slug")
  if (result.error) throw fail("Product", result.error)
  const product = result.data[0]
  if (!product) {
    throw new Error("Product: no product with that id; it may be deleted.")
  }
  if (photos) await writePhotos(supabase, product.id, images, place, fail)

  return {
    id: product.id,
    slug: product.slug,
    images: images.map((image) => place(image.path)),
  }
}

/** A product updateProducts saved: its address and new revision. */
export type UpdatedProduct = {
  id: string
  name: string
  slug: string
  status: string
  updated_at: string
}

/** One instant however it's written ("Z" or "+00:00"), to the microsecond
 * Postgres keeps (Date.parse stops at milliseconds). */
const instant = (time: string) =>
  `${Date.parse(time)}.${(time.match(/\.(\d+)/)?.[1] ?? "").padEnd(6, "0").slice(3, 6)}`
const sameInstant = (a: string, b: string) => instant(a) === instant(b)

/**
 * The agent's product edits: each product's given fields, and its photos
 * when given. Every product must be unchanged since the agent read it
 * (`updated_at`), so an approval never overwrites the owner's newer edit;
 * all are checked before anything is written. Products are written one at a
 * time, and a failure part-way names what was saved.
 */
export async function updateProducts(
  supabase: Supabase,
  { products }: UpdateProductsInput,
  fail: Fail
): Promise<UpdatedProduct[]> {
  const { data: current, error } = await supabase
    .from("products")
    .select(
      "id, name, category_slug, condition, condition_note, availability, status, updated_at"
    )
    .in(
      "id",
      products.map((product) => product.id)
    )
  if (error) throw fail("Products", error)
  const byId = new Map(current.map((row) => [row.id, row]))
  const missing = products.filter((product) => !byId.has(product.id))
  if (missing.length > 0) {
    throw new Error(
      `Products: ${missing.map((product) => `“${product.name}”`).join(", ")} no longer exist. Read the catalog again.`
    )
  }
  const stale = products.filter(
    (product) =>
      !sameInstant(byId.get(product.id)!.updated_at, product.updated_at)
  )
  if (stale.length > 0) {
    throw new Error(
      `Products: ${stale.map((product) => `“${product.name}”`).join(", ")} changed since you read ${stale.length === 1 ? "it" : "them"}. Nothing was saved. Read ${stale.length === 1 ? "it" : "them"} again and propose the changes on the current values.`
    )
  }

  const place = await placeUploads(
    supabase,
    products.flatMap(({ changes }) =>
      (changes.images ?? []).map((image) => image.path)
    ),
    "products",
    fail
  )
  const saved: UpdatedProduct[] = []
  for (const { id, name, changes } of products) {
    const before = byId.get(id)!
    try {
      const update = productUpdate(before, changes)
      const result = await supabase
        .from("products")
        .update(
          Object.keys(update).length > 0
            ? update
            : { updated_at: new Date().toISOString() }
        )
        .eq("id", id)
        .eq("updated_at", before.updated_at)
        .select("id, name, slug, status, updated_at")
      if (result.error) throw fail(`“${name}”`, result.error)
      const row = result.data[0]
      if (!row) {
        throw new Error(
          `“${name}” changed while saving; read it again before proposing it.`
        )
      }
      if (changes.images) {
        await writePhotos(supabase, id, changes.images, place, fail)
      }
      saved.push(row)
    } catch (problem) {
      const reason = problem instanceof Error ? problem.message : "failed"
      if (saved.length === 0) throw problem
      throw new Error(
        `Saved ${saved.map((product) => `“${product.name}”`).join(", ")}; then ${reason} The products after it weren't saved. Don't repeat the saved ones.`
      )
    }
  }
  return saved
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
