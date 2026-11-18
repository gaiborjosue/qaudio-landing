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
  logo_path: string | null
  featured?: boolean
}

export type ProductImage = {
  id: string
  src: string
  alt: string
  width: number
  height: number
  caption?: string
}

/** Keep source qualifications without repeating the price, unit or status labels. */
export function priceQualifications(note = "", condition = "") {
  const startingAt = /\bstarting\s+at\b/i.test(note)
  const parts = note.split("·").map((part) => {
    const text = part
      .trim()
      .replace(/\(\s*(?:each|pair|new)\s*\)/gi, "")
      .replace(/^(?:msrp|(?:used|sale|item|regular|list)\s+price)\b\s*/i, "")
      .replace(/\bstarting\s+at\b\s*:?/gi, "")
      .replace(/^[\s:]+|[\s:]+$/g, "")
    if (/^(?:sold(?:\s*out)?|unavailable)$/i.test(text)) return ""
    if (condition === "Demo" && /^demo\s+sale$/i.test(text)) return ""
    return text
  })
  return { startingAt, text: [...new Set(parts.filter(Boolean))].join(" · ") }
}

/** Used stock includes the demos listed in the Used Equipment category. */
export function isUsedEquipment(category: string, condition: string) {
  return category === "used-equipment" || condition === "Used"
}

/** The condition badge supplies New/Demo/Used; retain only grade/terms beside it. */
export function conditionQualification(note = "") {
  return [
    ...new Set(
      note
        .split("·")
        .map((part) => {
          const text = part
            .trim()
            .replace(/^(?:new|demo|used)\b\s*/i, "")
            .replace(/^\((.*)\)$/, "$1")
            .trim()
          return text ? text[0].toUpperCase() + text.slice(1) : ""
        })
        .filter(Boolean)
    ),
  ].join(" · ")
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
  price_cents: number | null
  /** Manufacturer list price for comparison; null when unknown. */
  msrp_cents: number | null
  /** A time-limited sale showing now, if any. */
  sale?: ProductSale | null
  price_note?: string
  condition_note?: string
  availability?: string
  price_unit: string
  condition: string
  ready_for_audition: boolean
  manufacturer_url: string | null
  category: Pick<CatalogCategory, "slug" | "name" | "artwork_path">
  brand: CatalogBrand | null
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
  price_cents: number | null
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
): { price_cents: number | null; sale: ProductSale | null } {
  const live =
    price_cents !== null &&
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

export const formatPrice = (cents: number | null) =>
  cents === null
    ? "Price on request"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
      }).format(cents / 100)

export const isProductOnSale = (
  product: Pick<Product, "price_cents" | "msrp_cents" | "sale">
) =>
  !!product.sale ||
  (product.price_cents !== null &&
    product.msrp_cents !== null &&
    product.price_cents < product.msrp_cents)

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
