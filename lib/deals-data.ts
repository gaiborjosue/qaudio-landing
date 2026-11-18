import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import { mediaUrl } from "@/lib/media"
import { publicSupabase } from "@/lib/supabase/public"
import { isDealCondition, type DealCondition, type DealKind } from "@/lib/deals"

// Live deals from Supabase, read as an anonymous visitor, so RLS leaves out
// drafts and deals outside their dates. QDeals (/qdeal) are Q Audio-only
// opportunities; featured sales (/sales) are promotions shown above the
// products on sale. Results are cached under DEALS_CACHE_TAG with the
// "content" profile (5 minutes); saves call updateTag(DEALS_CACHE_TAG) so
// edits show up right away.
export const DEALS_CACHE_TAG = "deals"

export type DealItem = {
  id: string
  brand: string
  name: string
  condition: DealCondition | null
  priceCents: number | null
  /** The shop product's page, while it's published. */
  href?: string | null
}

export type Deal = {
  id: string
  title: string
  summary: string
  note: string
  image?: { src: string; width: number; height: number; alt: string } | null
  /** When it disappears: an ISO instant, or null. */
  endsAt?: string | null
  items: DealItem[]
}

/** Live deals of one kind and their products, each in sort order. */
export async function getDeals(kind: DealKind): Promise<Deal[]> {
  "use cache"
  cacheLife("content")
  cacheTag(DEALS_CACHE_TAG)
  const { data, error } = await publicSupabase()
    .from("deals")
    // A linked product a visitor can't read (a draft) comes back null.
    .select(
      "*, deal_items (id, brand, name, condition, price_cents, product:products (slug))"
    )
    .eq("kind", kind)
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
    endsAt: deal.ends_at,
    items: deal.deal_items.map((item) => ({
      id: item.id,
      brand: item.brand,
      name: item.name,
      condition: isDealCondition(item.condition) ? item.condition : null,
      priceCents: item.price_cents,
      href: item.product ? `/products/${item.product.slug}` : null,
    })),
  }))
}
