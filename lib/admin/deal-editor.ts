import {
  DEAL_PAGES,
  isDealCondition,
  type DealCondition,
  type DealKind,
} from "../deals"
import type { DealRecord } from "./deal-save"
import type { AdminDealItem, AdminProduct } from "./preview"
import { parseDollars } from "./product-editor"
import type { DealInput } from "./schemas"

// The Deals tab's form and table: what the owner types, before it's a
// DealInput, and where each deal stands. Prices stay as typed ("1,299")
// until Save turns them into cents. Pure; tested in scripts/deals.test.mjs.

export type DealItemValues = {
  /** Keeps a row's fields together as rows move; never saved. */
  key: string
  /** The shop product the row links to, or "". */
  product_id: string
  brand: string
  name: string
  condition: DealCondition | ""
  /** Dollars as typed; empty shows no price. */
  price: string
}

export type DealValues = {
  /** Set once the deal exists; Save then edits it. */
  id?: string
  kind: DealKind
  status: "draft" | "published"
  title: string
  summary: string
  note: string
  /** Store-time "YYYY-MM-DDTHH:MM", or "" for none. */
  startsAt: string
  endsAt: string
  image: { path: string; width: number; height: number; alt: string } | null
  items: DealItemValues[]
  sortOrder: number
}

const dollars = (cents: number | null) =>
  cents === null ? "" : String(cents / 100)

/** The form's starting values: a saved deal, or a new one of `kind`. */
export function valuesFromDeal(
  deal?: DealRecord,
  kind: DealKind = "qdeal"
): DealValues {
  return {
    id: deal?.id,
    kind: deal?.kind ?? kind,
    status: deal?.status ?? "published",
    title: deal?.title ?? "",
    summary: deal?.summary ?? "",
    note: deal?.note ?? "",
    startsAt: deal?.starts_at ?? "",
    endsAt: deal?.ends_at ?? "",
    image: deal?.image ?? null,
    sortOrder: deal?.sort_order ?? 0,
    items: (deal?.items ?? []).map((item, index) => ({
      key: `item-${index}`,
      product_id: item.product_id ?? "",
      brand: item.brand,
      name: item.name,
      condition: item.condition ?? "",
      price: dollars(item.price_cents),
    })),
  }
}

/** A row filled in from a shop product, still editable. */
export function itemFromProduct(
  product: AdminProduct,
  key: string
): DealItemValues {
  const condition = product.condition.toLowerCase()
  return {
    key,
    product_id: product.id,
    brand: product.brand?.name ?? "",
    name: product.name,
    condition: isDealCondition(condition) ? condition : "",
    price: dollars(product.price_cents),
  }
}

/** The deal Save sends, before validation (dealInputSchema checks it). */
export function inputFromDeal(values: DealValues): DealInput {
  return {
    ...(values.id && { id: values.id }),
    kind: values.kind,
    title: values.title.trim(),
    summary: values.summary.trim(),
    note: values.note.trim(),
    status: values.status,
    starts_at: values.startsAt || null,
    ends_at: values.endsAt || null,
    sort_order: values.sortOrder,
    image: values.image && { ...values.image, alt: values.image.alt.trim() },
    items: values.items.map((item) => ({
      brand: item.brand.trim(),
      name: item.name.trim(),
      condition: item.condition || null,
      price_cents: item.price.trim() ? parseDollars(item.price) : null,
      product_id: item.product_id || null,
    })),
  }
}

export type DealState = "draft" | "scheduled" | "live" | "ended"

export const DEAL_STATE_LABELS: Record<DealState, string> = {
  live: "Live",
  scheduled: "Scheduled",
  draft: "Draft",
  ended: "Ended",
}

/** Where a deal stands at `now` (store time). */
export function dealState(
  deal: Pick<AdminDealItem, "status" | "startsAt" | "endsAt">,
  now: string
): DealState {
  if (deal.status !== "published") return "draft"
  if (deal.endsAt && deal.endsAt <= now) return "ended"
  if (deal.startsAt && deal.startsAt > now) return "scheduled"
  return "live"
}

// Matching ignores case and accents, like the other tabs.
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

/** The deals a search, kind, and state filter leave. */
export function filterDeals(
  deals: AdminDealItem[],
  { search, kind, state }: { search: string; kind: string; state: string },
  now: string
) {
  const words = fold(search).split(/\s+/).filter(Boolean)
  return deals.filter((deal) => {
    if (kind && (deal.kind ?? "qdeal") !== kind) return false
    if (state && dealState(deal, now) !== state) return false
    const text = fold(
      `${deal.title} ${deal.record?.summary ?? ""} ${(deal.record?.items ?? [])
        .map((item) => `${item.brand} ${item.name}`)
        .join(" ")}`
    )
    return words.every((word) => text.includes(word))
  })
}

/** The page a deal shows on. */
export const dealPage = (deal: { kind?: DealKind }) =>
  DEAL_PAGES[deal.kind ?? "qdeal"]

/** What Tune is asked when the owner hands it a deal from the tab. */
export function dealChatMessage(deal?: Pick<AdminDealItem, "id" | "title">) {
  return deal
    ? `I want to edit the deal “${deal.title}”.\nItem: deal ${deal.id}`
    : "I want to create a deal."
}
