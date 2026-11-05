import { formatMonthDay, storeClock } from "./store-hours"

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
  /** A time-limited sale showing now, if any. */
  sale?: ProductSale | null
  price_unit: string
  condition: string
  ready_for_audition: boolean
  manufacturer_url: string | null
  category: Pick<CatalogCategory, "slug" | "name" | "artwork_path">
  brand: CatalogBrand
  images: ProductImage[]
}

/** A time-limited sale price that shows now (price_cents is the sale price). */
export type ProductSale = {
  /** The regular selling price the sale replaces, in US cents. */
  regular_price_cents: number
  /** When the sale ends: an ISO instant. */
  ends_at: string
}

/** A product's price columns, with its time-limited sale. */
export type SaleColumns = {
  price_cents: number
  sale_price_cents: number | null
  sale_starts_at: string | null
  sale_ends_at: string | null
}

/**
 * The selling price at `now` (milliseconds): the sale price inside its
 * window, else the regular price. Sales end by themselves this way, with
 * nothing to run at the deadline.
 */
export function sellingPrice(
  { price_cents, sale_price_cents, sale_starts_at, sale_ends_at }: SaleColumns,
  now: number
): { price_cents: number; sale: ProductSale | null } {
  const live =
    sale_price_cents !== null &&
    sale_ends_at !== null &&
    sale_price_cents < price_cents &&
    Date.parse(sale_ends_at) > now &&
    (sale_starts_at === null || Date.parse(sale_starts_at) <= now)
  return live
    ? {
        price_cents: sale_price_cents,
        sale: { regular_price_cents: price_cents, ends_at: sale_ends_at },
      }
    : { price_cents, sale: null }
}

/** "Ends Jan 4": the store-time day a sale ends. */
export const formatSaleEnd = (endsAt: string) =>
  `Ends ${formatMonthDay(storeClock(new Date(endsAt)).date)}`

export const formatPrice = (cents: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100)

export const isProductOnSale = (
  product: Pick<Product, "price_cents" | "msrp_cents" | "sale">
) =>
  !!product.sale ||
  (product.msrp_cents !== null && product.price_cents < product.msrp_cents)

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
