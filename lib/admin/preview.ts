import {
  sellingPrice,
  type CatalogBrand,
  type CatalogCategory,
  type Product,
  type ProductImage,
} from "@/lib/catalog"
import type {
  DayHoursInput,
  DealInput,
  HoursChangeInput,
  NewsPostInput,
  ProductInput,
  ProductSaleInput,
  WeeklyHoursInput,
} from "@/lib/admin/schemas"
import { fromStoreDateTime } from "@/lib/admin/store-time"
import type { Deal } from "@/lib/deals-data"
import { mediaUrl } from "@/lib/media"
import { newsExcerpt, type NewsBlock, type NewsSummary } from "@/lib/news"
import {
  storeClock,
  type DayHours,
  type HoursChange,
  type StoreSchedule,
} from "@/lib/store-hours"

// Pure helpers that turn the admin agent's proposed changes into the data the
// site's own components render, so the approval card shows the real look.

type HoursRow = {
  kind: string
  opens_at?: string | null
  closes_at?: string | null
}

/** A database or tool hours row ("HH:MM" or "HH:MM:SS") as site hours. */
export function toDayHours(row: HoursRow): DayHours {
  if (row.kind === "open" && row.opens_at && row.closes_at) {
    return { open: row.opens_at.slice(0, 5), close: row.closes_at.slice(0, 5) }
  }
  return row.kind === "appointment" ? "appointment" : "closed"
}

/** Store hours with each schedule change's id, for editing. */
export type AdminSchedule = {
  weekly: DayHours[]
  changes: (HoursChange & { id: string })[]
}

function sortChanges<T extends HoursChange>(changes: T[]) {
  return changes.sort((a, b) => a.start.localeCompare(b.start))
}

export function withWeek(
  schedule: AdminSchedule,
  { week }: WeeklyHoursInput
): StoreSchedule {
  return {
    weekly: week.map((day: DayHoursInput) => toDayHours(day)),
    changes: schedule.changes,
  }
}

export function changeFromInput(input: HoursChangeInput): HoursChange {
  return {
    start: input.starts_on,
    ...(input.ends_on !== input.starts_on && { end: input.ends_on }),
    hours: toDayHours(input),
    ...(input.note && { note: input.note }),
  }
}

export function withChange(
  schedule: AdminSchedule,
  input: HoursChangeInput
): StoreSchedule {
  const others = schedule.changes.filter((change) => change.id !== input.id)
  return {
    weekly: schedule.weekly,
    changes: sortChanges([...others, changeFromInput(input)]),
  }
}

export function withoutChange(
  schedule: AdminSchedule,
  id: string
): StoreSchedule {
  return {
    weekly: schedule.weekly,
    changes: schedule.changes.filter((change) => change.id !== id),
  }
}

export type CatalogTaxonomy = {
  categories: CatalogCategory[]
  brands: CatalogBrand[]
}

/** The proposed product as the shop renders it, or why it can't be shown. */
export function productFromInput(
  input: ProductInput,
  { categories, brands }: CatalogTaxonomy
): { product: Product } | { problem: string } {
  const category = categories.find((item) => item.slug === input.category_slug)
  const brand = brands.find((item) => item.slug === input.brand_slug)
  if (!category)
    return { problem: `Unknown category “${input.category_slug}”.` }
  if (!brand) return { problem: `Unknown brand “${input.brand_slug}”.` }
  return {
    product: shopProduct(
      {
        id: input.id ?? `preview-${input.slug}`,
        slug: input.slug,
        name: input.name,
        short_description: input.short_description,
        description: input.description,
        price_cents: input.price_cents,
        msrp_cents: input.msrp_cents,
        sale_window: input.sale,
        price_unit: input.price_unit,
        condition: input.condition,
        ready_for_audition: input.ready_for_audition,
        manufacturer_url: input.manufacturer_url,
        status: input.status,
        category: {
          slug: category.slug,
          name: category.name,
          artwork_path: category.artwork_path,
        },
        brand,
        images: input.images.map((image, index) => ({
          id: `${index}-${image.path}`,
          src: mediaUrl(image.path),
          path: image.path,
          alt: image.alt,
          width: image.width,
          height: image.height,
        })),
      },
      new Date()
    ),
  }
}

/**
 * A catalog product with its status and photo paths, for the admin.
 * `price_cents` is the regular price; a time-limited sale, live or not, is
 * `sale_window`, in store time.
 */
export type AdminProduct = Omit<Product, "images"> & {
  status: string
  images: (ProductImage & { path: string })[]
  sale_window?: ProductSaleInput | null
}

/** The product as the shop shows it at `now`: its sale price if one is live. */
export function shopProduct<T extends AdminProduct>(product: T, now: Date): T {
  const sale = product.sale_window
  if (!sale) return product
  return {
    ...product,
    ...sellingPrice(
      {
        price_cents: product.price_cents,
        sale_price_cents: sale.price_cents,
        sale_starts_at: sale.starts_at && fromStoreDateTime(sale.starts_at),
        sale_ends_at: fromStoreDateTime(sale.ends_at),
      },
      now.getTime()
    ),
  }
}

/** A news post as the Edit menu lists it; dates are store time. */
export type AdminNewsItem = {
  id: string
  title: string
  status: string
  /** "YYYY-MM-DDTHH:MM", or null for an undated draft. */
  publishedAt: string | null
}

/** A QDeal promotion as the Edit menu lists it; dates are store time. */
export type AdminDealItem = {
  id: string
  title: string
  status: string
  startsAt: string | null
  endsAt: string | null
}

/**
 * The listed products in their proposed order, or the ids it can't show
 * (products added since the page loaded).
 */
export function productsInOrder(ids: string[], products: AdminProduct[]) {
  const byId = new Map(products.map((product) => [product.id, product]))
  const ordered = ids.flatMap((id) => byId.get(id) ?? [])
  return { ordered, unknown: ids.length - ordered.length }
}

/** The proposed post as its feed card and article body render it. */
export function newsFromInput(input: NewsPostInput): {
  card: NewsSummary | null
  body: NewsBlock[]
} {
  const body: NewsBlock[] = input.body.map((block) =>
    block.type === "image"
      ? { ...block, image: { ...block.image, src: mediaUrl(block.image.src) } }
      : block
  )
  const when =
    input.published_at && input.published_at !== "now"
      ? input.published_at.slice(0, 10)
      : storeClock(new Date()).date
  const card = input.cover && {
    slug: input.slug,
    title: input.title,
    date: when,
    excerpt: newsExcerpt(input.body as NewsBlock[]),
    cover: {
      src: mediaUrl(input.cover.path),
      width: input.cover.width,
      height: input.cover.height,
      alt: input.cover.alt,
      ...(input.cover.fit === "contain" && { fit: "contain" as const }),
    },
  }
  return { card, body }
}

/** The proposed deal as the QDeal page's card renders it. */
export function dealFromInput(input: DealInput): Deal {
  return {
    id: input.id ?? "preview",
    title: input.title,
    summary: input.summary,
    note: input.note,
    items: input.items.map((item, index) => ({
      id: String(index),
      brand: item.brand,
      name: item.name,
      condition: item.condition,
      priceCents: item.price_cents,
    })),
  }
}
