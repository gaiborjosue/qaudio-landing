import type { SupabaseClient } from "@supabase/supabase-js"
import { DEAL_PAGES, isDealCondition, type DealKind } from "../deals"
import type { Database } from "../supabase/database"
import type { DealInput, DealQuickEdit } from "./schemas"
import { fromStoreDateTime, toStoreDateTime } from "./store-time"
import { placeUploads, type Fail } from "./uploads"

// Reading, saving, and deleting deals (QDeals and featured sales), shared by
// the agent's deals__ tools and the admin's Deals tab (Server Actions). Both
// pass a client signed in as the admin, so RLS applies. Relative imports,
// because the agent imports this too.

type Supabase = SupabaseClient<Database>

/** A deal with every field, as deals__save_deal takes it, in store time. */
export type DealRecord = Omit<DealInput, "id" | "kind" | "updated_at"> & {
  id: string
  kind: DealKind
  updated_at: string
}

const DEAL_COLUMNS =
  "id, kind, title, summary, note, status, sort_order, starts_at, ends_at, image_path, image_width, image_height, image_alt, updated_at, deal_items (brand, name, condition, price_cents, product_id, sort_order, created_at)" as const

/** Every deal (drafts, scheduled, live, and ended), in their pages' order. */
export async function readDeals(
  supabase: Supabase,
  fail: Fail
): Promise<DealRecord[]> {
  const { data, error } = await supabase
    .from("deals")
    .select(DEAL_COLUMNS)
    .order("sort_order")
    .order("created_at")
  if (error) throw fail("Deals", error)
  return data.map((deal) => ({
    id: deal.id,
    kind: deal.kind === "sale" ? "sale" : "qdeal",
    title: deal.title,
    summary: deal.summary,
    note: deal.note,
    status: deal.status === "published" ? "published" : "draft",
    sort_order: deal.sort_order,
    starts_at: deal.starts_at && toStoreDateTime(deal.starts_at),
    ends_at: deal.ends_at && toStoreDateTime(deal.ends_at),
    image:
      deal.image_path && deal.image_width && deal.image_height
        ? {
            path: deal.image_path,
            width: deal.image_width,
            height: deal.image_height,
            alt: deal.image_alt,
          }
        : null,
    updated_at: deal.updated_at,
    items: deal.deal_items
      .sort(
        (a, b) =>
          a.sort_order - b.sort_order ||
          a.created_at.localeCompare(b.created_at)
      )
      .map(({ brand, name, condition, price_cents, product_id }) => ({
        brand,
        name,
        condition: isDealCondition(condition) ? condition : null,
        price_cents,
        product_id,
      })),
  }))
}

/** Whether a deal shows on its page at `now` (milliseconds). */
export function dealLive(
  deal: {
    status: string
    starts_at: string | null
    ends_at: string | null
  },
  now: number
) {
  const starts = deal.starts_at && Date.parse(fromStoreDateTime(deal.starts_at))
  const ends = deal.ends_at && Date.parse(fromStoreDateTime(deal.ends_at))
  return (
    deal.status === "published" &&
    (!starts || starts <= now) &&
    (!ends || ends > now)
  )
}

/** The deal field a column belongs to. */
const columnField = (column: string) =>
  column.startsWith("image_") ? "image" : column

/**
 * Adds a deal, or replaces an existing one's fields and products by id. An
 * uploaded image is copied into deals/ first; an omitted image stays, null
 * removes it, and an omitted kind stays. With `only`, an edit writes just
 * those fields (its products only when they're among them), so changes made
 * elsewhere meanwhile stay. With `updated_at`, it refuses a deal changed
 * since then.
 */
export async function saveDeal(
  supabase: Supabase,
  {
    id,
    updated_at,
    items,
    image,
    starts_at,
    ends_at,
    title,
    summary,
    note,
    ...deal
  }: DealInput,
  fail: Fail,
  only?: ReadonlySet<string>
) {
  const partial = !!id && !!only
  const place = await placeUploads(
    supabase,
    image && (!partial || only.has("image")) ? [image.path] : [],
    "deals",
    fail
  )
  const full = {
    ...deal,
    title: title.trim(),
    summary: summary.trim(),
    note: note.trim(),
    starts_at: starts_at && fromStoreDateTime(starts_at),
    ends_at: ends_at && fromStoreDateTime(ends_at),
    ...(image !== undefined && {
      image_path: image ? place(image.path) : null,
      image_width: image?.width ?? null,
      image_height: image?.height ?? null,
      image_alt: image?.alt.trim() ?? "",
    }),
  }
  const row = partial
    ? Object.fromEntries(
        Object.entries(full).filter(([column]) => only.has(columnField(column)))
      )
    : full
  const columns =
    "id, kind, status, starts_at, ends_at, image_path, image_width, image_height, image_alt, updated_at"
  let result
  if (id) {
    let query = supabase
      .from("deals")
      .update(
        // Products alone still mark the deal as changed.
        Object.keys(row).length > 0
          ? row
          : { updated_at: new Date().toISOString() }
      )
      .eq("id", id)
    if (updated_at) query = query.eq("updated_at", updated_at)
    result = await query.select(columns)
  } else {
    result = await supabase.from("deals").insert(full).select(columns)
  }
  if (result.error) throw fail("Deal", result.error)
  const saved = result.data[0]
  if (!saved) {
    if (id && updated_at) {
      const exists = await supabase
        .from("deals")
        .select("id")
        .eq("id", id)
        .maybeSingle()
      if (exists.data) {
        throw new Error(
          "Deal: it changed since you read it, so nothing was saved. Read it again with deals__list_deals and propose the change on the current deal."
        )
      }
    }
    throw new Error(
      "Deal: no deal with that id. Look it up again with deals__list_deals."
    )
  }

  if (!partial || only.has("items")) {
    // Add the new product list before removing the old one, so a failure
    // never leaves the deal without products.
    const previous = await supabase
      .from("deal_items")
      .select("id")
      .eq("deal_id", saved.id)
    if (previous.error) throw fail("Deal products", previous.error)
    if (items.length > 0) {
      const inserted = await supabase.from("deal_items").insert(
        items.map((item, sort_order) => ({
          deal_id: saved.id,
          sort_order,
          brand: item.brand.trim(),
          name: item.name.trim(),
          condition: item.condition,
          price_cents: item.price_cents,
          product_id: item.product_id ?? null,
        }))
      )
      if (inserted.error) throw fail("Deal products", inserted.error)
    }
    const oldIds = previous.data.map((item) => item.id)
    if (oldIds.length > 0) {
      const removed = await supabase
        .from("deal_items")
        .delete()
        .in("id", oldIds)
      if (removed.error) throw fail("Deal products", removed.error)
    }
  }

  const kind: DealKind = saved.kind === "sale" ? "sale" : "qdeal"
  return {
    id: saved.id,
    kind,
    updated_at: saved.updated_at,
    image:
      saved.image_path && saved.image_width && saved.image_height
        ? {
            path: saved.image_path,
            width: saved.image_width,
            height: saved.image_height,
            alt: saved.image_alt,
          }
        : null,
    live: dealLive(
      {
        status: saved.status,
        starts_at: saved.starts_at && toStoreDateTime(saved.starts_at),
        ends_at: saved.ends_at && toStoreDateTime(saved.ends_at),
      },
      Date.now()
    ),
    url: DEAL_PAGES[kind],
  }
}

/** Statuses changed in the Deals tab's table, each on its own deal. */
export async function saveDealQuickEdits(
  supabase: Supabase,
  edits: DealQuickEdit[],
  fail: Fail
) {
  const results = await Promise.all(
    edits.map(({ id, status }) =>
      supabase.from("deals").update({ status }).eq("id", id).select("id")
    )
  )
  for (const result of results) {
    if (result.error) throw fail("Deal", result.error)
    if (result.data.length !== 1) {
      throw new Error("Deal: one of these deals no longer exists.")
    }
  }
  return { saved: edits.length }
}

/** Deletes a deal and its products; false when no deal has that id. */
export async function deleteDeal(supabase: Supabase, id: string, fail: Fail) {
  const { data, error } = await supabase
    .from("deals")
    .delete()
    .eq("id", id)
    .select("id")
  if (error) throw fail("Deal", error)
  return data.length > 0
}
