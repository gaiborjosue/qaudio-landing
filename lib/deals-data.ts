import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import { mediaUrl } from "@/lib/media"
import { publicSupabase } from "@/lib/supabase/public"

// Live QDeal promotions from Supabase, read as an anonymous visitor, so RLS
// leaves out drafts and deals outside their dates. Results are cached under
// DEALS_CACHE_TAG with the "content" profile (5 minutes); admin Server
// Actions will call updateTag(DEALS_CACHE_TAG) after a save so edits show up
// right away.
export const DEALS_CACHE_TAG = "deals"

export type DealItem = {
  id: string
  brand: string
  name: string
  condition: "new" | "demo" | null
  priceCents: number | null
}

export type Deal = {
  id: string
  title: string
  summary: string
  note: string
  image?: { src: string; width: number; height: number; alt: string } | null
  items: DealItem[]
}

/** Live deals and their products, each in sort order. */
export async function getDeals(): Promise<Deal[]> {
  "use cache"
  cacheLife("content")
  cacheTag(DEALS_CACHE_TAG)
  const { data, error } = await publicSupabase()
    .from("deals")
    .select("*, deal_items (id, brand, name, condition, price_cents)")
    .order("sort_order")
    .order("created_at")
    .order("sort_order", { referencedTable: "deal_items" })
    .order("created_at", { referencedTable: "deal_items" })
  if (error) throw new Error(`Deals: ${error.message}`)
  return data.map((deal) => ({
    id: deal.id,
    title: deal.title,
    summary: deal.summary,
    note: deal.note,
    image:
      deal.image_path && deal.image_width && deal.image_height
        ? {
            src: mediaUrl(deal.image_path),
            width: deal.image_width,
            height: deal.image_height,
            alt: deal.image_alt,
          }
        : null,
    items: deal.deal_items.map((item) => ({
      id: item.id,
      brand: item.brand,
      name: item.name,
      condition:
        item.condition === "new" || item.condition === "demo"
          ? item.condition
          : null,
      priceCents: item.price_cents,
    })),
  }))
}
