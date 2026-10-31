import "server-only"
import { unstable_cache } from "next/cache"
import { publicSupabase, mediaUrl } from "@/lib/supabase/public"
import type { Product } from "@/lib/catalog"

export const CATALOG_CACHE_TAG = "catalog"

// Match the site's existing cache model; Cache Components remains disabled.
export const getCatalogTaxonomy = unstable_cache(
  async () => {
    const [categories, brands] = await Promise.all([
      publicSupabase()
        .from("catalog_categories")
        .select("slug, name, artwork_path")
        .order("sort_order"),
      publicSupabase()
        .from("catalog_brands")
        .select("slug, name, logo_path")
        .order("sort_order"),
    ])
    if (categories.error)
      throw new Error(`Catalog categories: ${categories.error.message}`)
    if (brands.error) throw new Error(`Catalog brands: ${brands.error.message}`)
    return { categories: categories.data, brands: brands.data }
  },
  ["catalog-taxonomy"],
  { tags: [CATALOG_CACHE_TAG], revalidate: 300 }
)

export const getProducts = unstable_cache(
  async (categorySlug?: string, brandSlug?: string): Promise<Product[]> => {
    let query = publicSupabase()
      .from("products")
      .select(
        `
      id, slug, name, short_description, description_intro, features,
      description_closing, price_cents, msrp_cents, price_unit, condition,
      ready_for_audition, manufacturer_url,
      category:catalog_categories!inner(slug, name, artwork_path),
      brand:catalog_brands!inner(slug, name, logo_path),
      product_images(id, path, alt, width, height, sort_order)
    `
      )
      .eq("status", "published")
      .order("sort_order")
      .order("id")
    if (categorySlug) query = query.eq("category_slug", categorySlug)
    if (brandSlug) query = query.eq("brand_slug", brandSlug)
    const { data, error } = await query
    if (error) throw new Error(`Catalog: ${error.message}`)
    return data.map(({ product_images, ...product }) => ({
      ...product,
      manufacturer_url: product.manufacturer_url?.startsWith("https://")
        ? product.manufacturer_url
        : null,
      images: product_images
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(({ path, ...image }) => ({ ...image, src: mediaUrl(path) })),
    }))
  },
  ["catalog-products"],
  { tags: [CATALOG_CACHE_TAG], revalidate: 300 }
)
