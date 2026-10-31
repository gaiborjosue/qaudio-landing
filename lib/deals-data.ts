import "server-only"
import { unstable_cache } from "next/cache"
import { publicSupabase } from "@/lib/supabase/public"

// Live QDeal promotions from Supabase, read as an anonymous visitor, so RLS
// leaves out drafts and deals outside their dates. Results are cached under
// DEALS_CACHE_TAG for 5 minutes; admin saves will call
// revalidateTag(DEALS_CACHE_TAG) so edits show up right away.
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
  items: DealItem[]
}

/** Live deals and their products, each in sort order. */
export const getDeals = unstable_cache(
  async (): Promise<Deal[]> => {
    const { data, error } = await publicSupabase()
      .from("deals")
      .select(
        "id, title, summary, note, deal_items (id, brand, name, condition, price_cents)"
      )
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
  },
  ["deals"],
  { tags: [DEALS_CACHE_TAG], revalidate: 300 }
)
