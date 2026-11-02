export type CatalogCategory = {
  slug: string
  /** Full title: shop page heading and wheel caption. */
  name: string
  /** Short label on the home page category wheel. */
  wheel_label: string
  artwork_path: string
  scene_path: string
}

export type CatalogBrand = {
  slug: string
  name: string
  logo_path: string
}

export type ProductImage = {
  id: string
  src: string
  alt: string
  width: number
  height: number
}

export type Product = {
  id: string
  slug: string
  name: string
  /** The card line. */
  short_description: string
  /** The details page's description, as Markdown. */
  description: string
  /** Current selling price, including any sale, in US cents. */
  price_cents: number
  /** Manufacturer list price for comparison; null when unknown. */
  msrp_cents: number | null
  price_unit: string
  condition: string
  ready_for_audition: boolean
  manufacturer_url: string | null
  category: Pick<CatalogCategory, "slug" | "name" | "artwork_path">
  brand: CatalogBrand
  images: ProductImage[]
}

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)

export const isProductOnSale = (
  product: Pick<Product, "price_cents" | "msrp_cents">
) => product.msrp_cents !== null && product.price_cents < product.msrp_cents

/** Product pages live at /products/<slug>, the live qaudio.com address. */
export const PRODUCT_PATH = "/products/"
export const productHref = (product: Pick<Product, "slug">) =>
  `${PRODUCT_PATH}${product.slug}`

/** A product's description columns, as the database stores them. */
export type DescriptionColumns = {
  description_intro: string
  features: string[]
  description_closing: string
}

/**
 * The description as one Markdown text. The database keeps the shape it was
 * imported with (an intro line, feature bullets, a closing line); the admin
 * writes the whole Markdown into description_intro and empties the other
 * two, so either kind reads back the same way.
 */
export function descriptionFromColumns({
  description_intro,
  features,
  description_closing,
}: DescriptionColumns) {
  const closing = description_closing.trim()
  return [
    description_intro.trim(),
    features.map((feature) => `- ${feature.trim()}`).join("\n"),
    closing && `**${closing}**`,
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** The columns a Markdown description is saved to. */
export function descriptionColumns(description: string): DescriptionColumns {
  return {
    description_intro: description.trim(),
    features: [],
    description_closing: "",
  }
}
