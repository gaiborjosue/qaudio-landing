// Explicit projections shared by public/admin reads of the applied schema.
export const BASE_PRODUCT_FIELDS = `id, slug, category_slug, brand_slug,
  name, short_description, description_intro, features, description_closing,
  price_cents, msrp_cents, price_unit, condition, ready_for_audition,
  manufacturer_url, status, sort_order,
  sale_price_cents, sale_starts_at, sale_ends_at` as const
export const PRODUCT_FIELDS =
  `${BASE_PRODUCT_FIELDS}, price_note, condition_note, availability` as const
export const BASE_IMAGE_FIELDS =
  `id, path, alt, width, height, sort_order` as const
export const IMAGES = `${BASE_IMAGE_FIELDS}, caption` as const
export const TAXONOMY =
  `category:catalog_categories!inner(slug, name, artwork_path),
  brand:catalog_brands(slug, name, logo_path)` as const
export const PRODUCT_COLUMNS =
  `${PRODUCT_FIELDS}, ${TAXONOMY}, product_images(${IMAGES})` as const
export const RECORD_COLUMNS =
  `${PRODUCT_FIELDS}, product_images(${IMAGES})` as const
