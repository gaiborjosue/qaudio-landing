import { defineTool } from "eve/tools"
import { z } from "zod"
import { toStoreDateTime } from "../../lib/admin/store-time"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  description:
    "List every QDeal promotion (drafts, scheduled, live, and expired) with its products in order and store-time dates. Read it before changing a deal.",
  inputSchema: z.object({}),
  label: { start: () => "Read the deals" },
  async execute(_input, ctx) {
    const supabase = callerSupabase(ctx)
    const { data, error } = await supabase
      .from("deals")
      .select(
        "id, title, summary, note, status, sort_order, starts_at, ends_at, deal_items (brand, name, condition, price_cents, sort_order, created_at)"
      )
      .order("sort_order")
      .order("created_at")
    if (error) throw failure("Deals", error)
    const now = Date.now()
    return {
      deals: data.map(({ deal_items, starts_at, ends_at, ...deal }) => ({
        ...deal,
        starts_at: starts_at && toStoreDateTime(starts_at),
        ends_at: ends_at && toStoreDateTime(ends_at),
        live:
          deal.status === "published" &&
          (!starts_at || Date.parse(starts_at) <= now) &&
          (!ends_at || Date.parse(ends_at) > now),
        items: deal_items
          .sort(
            (a, b) =>
              a.sort_order - b.sort_order ||
              a.created_at.localeCompare(b.created_at)
          )
          .map(({ brand, name, condition, price_cents }) => ({
            brand,
            name,
            condition,
            price_cents,
          })),
      })),
    }
  },
})
