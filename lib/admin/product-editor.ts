import { isUsedEquipment } from "../catalog"
import type { AdminProduct } from "./preview"
import type { ProductDraft, ProductInput } from "./schemas"

// The product editor's form state: what the owner types, before it's a
// ProductInput. Prices stay as typed ("1,299") until Save turns them into
// cents.

export type EditorPhoto = {
  path: string
  alt: string
  width: number
  height: number
  caption?: string
}

export type ProductValues = {
  /** Set once the product exists; Save then edits it. */
  id?: string
  name: string
  slug: string
  category_slug: string
  brand_slug: string
  condition: ProductInput["condition"]
  ready_for_audition: boolean
  status: ProductInput["status"]
  /** Dollars as typed. */
  price_note: string
  condition_note: string
  availability: NonNullable<ProductInput["availability"]>
  price: string
  msrp: string
  price_unit: ProductInput["price_unit"]
  /** A time-limited sale: dollars as typed, and store-time
   * "YYYY-MM-DDTHH:MM" (an empty start is now). Empty price: no sale. */
  sale_price: string
  sale_starts: string
  sale_ends: string
  /** The card line; empty means Save has it written from the description. */
  short_description: string
  /** Markdown. */
  description: string
  manufacturer_url: string
  images: EditorPhoto[]
}

/** The form fields Prefill with Tune can suggest, besides photos. */
export const PREFILL_FIELDS = [
  "name",
  "brand_slug",
  "category_slug",
  "msrp",
  "price_unit",
  "description",
  "short_description",
] as const
export type PrefillField = (typeof PREFILL_FIELDS)[number]

/**
 * What Prefill with Tune read from a manufacturer's page, as form values for
 * the owner to accept or reject. Photos are already staged in uploads/.
 */
export type ProductSuggestions = Partial<Pick<ProductValues, PrefillField>> & {
  images?: EditorPhoto[]
}

/**
 * The manufacturer page check: `ok` answered, `blocked` answered but refused
 * the check (Tune may still read it), `missing` isn't there, `unreachable`
 * didn't answer.
 */
export type ProductPageStatus = "ok" | "blocked" | "missing" | "unreachable"

const dollars = (cents: number | null | undefined) =>
  cents ? String(cents / 100) : ""

/** The editor's starting values: a saved record or draft, with defaults. */
export function valuesFrom(
  record: ProductDraft & { id?: string } = {}
): ProductValues {
  return {
    id: record.id,
    name: record.name ?? "",
    slug: record.slug ?? "",
    category_slug: record.category_slug ?? "",
    brand_slug: record.brand_slug ?? "",
    condition: record.condition ?? "New",
    ready_for_audition: record.ready_for_audition ?? false,
    status: record.status ?? "draft",
    price: dollars(record.price_cents),
    price_note: record.price_note ?? "",
    condition_note: record.condition_note ?? "",
    availability: record.availability ?? "available",
    msrp: dollars(record.msrp_cents),
    price_unit: record.price_unit ?? "each",
    sale_price: dollars(record.sale?.price_cents),
    sale_starts: record.sale?.starts_at ?? "",
    sale_ends: record.sale?.ends_at ?? "",
    short_description: record.short_description ?? "",
    description: record.description ?? "",
    manufacturer_url: record.manufacturer_url ?? "",
    images: record.images ?? [],
  }
}

/** A product from the page's data, as the editor starts it. */
export function valuesFromProduct(product: AdminProduct): ProductValues {
  return valuesFrom({
    id: product.id,
    slug: product.slug,
    name: product.name,
    category_slug: product.category.slug,
    brand_slug: product.brand?.slug ?? null,
    condition: product.condition as ProductInput["condition"],
    ready_for_audition: product.ready_for_audition,
    status: product.status as ProductInput["status"],
    price_cents: product.price_cents,
    price_note: product.price_note,
    condition_note: product.condition_note,
    availability: product.availability as ProductInput["availability"],
    msrp_cents: product.msrp_cents,
    sale: product.sale_window ?? null,
    price_unit: product.price_unit as ProductInput["price_unit"],
    short_description: product.short_description,
    description: product.description,
    manufacturer_url: product.manufacturer_url,
    images: product.images.map(({ path, alt, width, height, caption }) => ({
      caption,
      path,
      alt,
      width,
      height,
    })),
  })
}

/** "$1,299.50" or "1299.5" as cents; NaN when it isn't a price. */
export function parseDollars(text: string) {
  const clean = text.replace(/[$,\s]/g, "")
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return Number.NaN
  return Math.round(Number(clean) * 100)
}

/** "Rega Planar 3" → "rega-planar-3": a slug from a name. */
export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120)
    .replace(/-+$/, "")
}

/** The sale fields as one comparable value (older saved drafts lack them). */
const saleKey = (values: ProductValues) =>
  [values.sale_price, values.sale_starts, values.sale_ends]
    .map((value) => (value ?? "").trim())
    .join("|")

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Unsaved form values over a newer save (a product's or a deal's): each
 * field the owner left as it was in `base` (what the form started from)
 * takes its value in `latest`, so a change made elsewhere meanwhile, by Tune
 * say, shows in the form and Save doesn't write the old value back.
 */
export function rebaseValues<T extends object>(
  values: T,
  base: T,
  latest: T
): T {
  const next = { ...values } as Record<string, unknown>
  for (const key of Object.keys(latest) as (keyof T & string)[]) {
    if (same(values[key], base[key])) next[key] = latest[key]
  }
  return next as T
}

/**
 * The fields Save writes for a saved product or deal: the ones that differ
 * from what the form started from. The rest stay as they are in the database,
 * even if they changed there since.
 */
export function changedInputFields(
  input: Record<string, unknown>,
  baseline: Record<string, unknown>
) {
  return Object.keys(input).filter(
    (key) => key !== "id" && !same(input[key], baseline[key])
  )
}

/**
 * The record Save sends, before validation (productInputSchema checks it on
 * both sides). Empty optional fields become null; a photo without alt text
 * gets the product's name, so a missing description never blocks a save.
 * The sale is sent only when it differs from `baseline`, so saving other
 * fields never undoes a sale Tune set meanwhile.
 */
export function inputFromValues(
  values: ProductValues,
  baseline?: ProductValues
) {
  const msrp = values.msrp.trim()
  const name = values.name.trim()
  const salePrice = (values.sale_price ?? "").trim()
  const sale = salePrice
    ? {
        price_cents: parseDollars(salePrice),
        starts_at: (values.sale_starts ?? "").trim() || null,
        ends_at: (values.sale_ends ?? "").trim(),
      }
    : null
  const saleChanged = !baseline || saleKey(values) !== saleKey(baseline)
  return {
    ...(values.id && { id: values.id }),
    slug: values.slug.trim(),
    category_slug: values.category_slug,
    brand_slug: values.brand_slug || null,
    name,
    short_description: values.short_description.trim(),
    description: values.description.trim(),
    price_cents: values.price.trim() ? parseDollars(values.price) : null,
    price_note: values.price_note,
    condition_note: values.condition_note,
    availability: values.availability,
    msrp_cents: msrp ? parseDollars(msrp) : null,
    ...(saleChanged && { sale }),
    price_unit: values.price_unit,
    condition: values.condition,
    ready_for_audition: values.ready_for_audition,
    manufacturer_url: values.manufacturer_url.trim() || null,
    status:
      values.availability === "sold" &&
      isUsedEquipment(values.category_slug, values.condition)
        ? ("draft" as const)
        : values.status,
    images: values.images.map((image, index) => ({
      ...image,
      alt:
        image.alt.trim() ||
        (index === 0 ? name : `${name}, photo ${index + 1}`) ||
        "Product photo",
    })),
  }
}
