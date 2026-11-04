import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import { publicSupabase, mediaUrl } from "@/lib/supabase/public"
import {
  brandAssets,
  categoryAssets,
  productTaxonomyAssets,
} from "@/lib/catalog-assets"
import {
  descriptionFromColumns,
  type CatalogBrand,
  type CatalogCategory,
  type Product,
} from "@/lib/catalog"

// Categories, brands, and published products, read as an anonymous visitor
// for the home page wheel and brand wall, the shop, and product pages. Results
// are cached under CATALOG_CACHE_TAG with the "content" profile (5 minutes);
// admin Server Actions will call updateTag(CATALOG_CACHE_TAG) after a save.
export const CATALOG_CACHE_TAG = "catalog"

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

const PRODUCT_COLUMNS = `
  id, slug, name, short_description, description_intro, features,
  description_closing, price_cents, msrp_cents, price_unit, condition,
  ready_for_audition, manufacturer_url,
  category:catalog_categories!inner(slug, name, artwork_path),
  brand:catalog_brands!inner(slug, name, logo_path),
  product_images(id, path, alt, width, height, sort_order)
`

function cacheCatalog() {
  cacheLife("content")
  cacheTag(CATALOG_CACHE_TAG)
}

function productsQuery() {
  return publicSupabase()
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("status", "published")
}

type ProductRow = NonNullable<
  Awaited<ReturnType<typeof productsQuery>>["data"]
>[number]

function toProduct({
  product_images,
  description_intro,
  features,
  description_closing,
  ...product
}: ProductRow): Product {
  return {
    ...productTaxonomyAssets(product),
    description: descriptionFromColumns({
      description_intro,
      features,
      description_closing,
    }),
    manufacturer_url: product.manufacturer_url?.startsWith("https://")
      ? product.manufacturer_url
      : null,
    images: product_images
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(({ path, ...image }) => ({ ...image, src: mediaUrl(path) })),
  }
}

export async function getCatalogTaxonomy(): Promise<{
  categories: CatalogCategory[]
  brands: CatalogBrand[]
}> {
  "use cache"
  cacheCatalog()
  const supabase = publicSupabase()
  const [categories, brands] = await Promise.all([
    supabase
      .from("catalog_categories")
      .select("slug, name, wheel_label, artwork_path, scene_path")
      .order("sort_order")
      .order("slug"),
    supabase
      .from("catalog_brands")
      .select("slug, name, logo_path")
      .order("sort_order")
      .order("slug"),
  ])
  if (categories.error)
    throw new Error(`Catalog categories: ${categories.error.message}`)
  if (brands.error) throw new Error(`Catalog brands: ${brands.error.message}`)
  return {
    categories: categories.data.map(categoryAssets),
    brands: brands.data.map(brandAssets),
  }
}

/** Published products, optionally for one category or brand, in order. */
export async function getProducts(
  categorySlug?: string,
  brandSlug?: string
): Promise<Product[]> {
  "use cache"
  cacheCatalog()
  let query = productsQuery().order("sort_order").order("id")
  if (categorySlug) query = query.eq("category_slug", categorySlug)
  if (brandSlug) query = query.eq("brand_slug", brandSlug)
  const { data, error } = await query
  if (error) throw new Error(`Catalog: ${error.message}`)
  return data.map(toProduct)
}

/** A published product by slug, or null. */
export async function getProduct(slug: string): Promise<Product | null> {
  "use cache"
  cacheCatalog()
  if (!SLUG.test(slug)) return null
  const { data, error } = await productsQuery().eq("slug", slug).maybeSingle()
  if (error) throw new Error(`Product ${slug}: ${error.message}`)
  return data && toProduct(data)
}

/** Slugs of published products, for prerendering product pages. */
export async function getProductSlugs(): Promise<string[]> {
  "use cache"
  cacheCatalog()
  const { data, error } = await publicSupabase()
    .from("products")
    .select("slug")
    .eq("status", "published")
  if (error) throw new Error(`Product slugs: ${error.message}`)
  return data.map(({ slug }) => slug)
}
