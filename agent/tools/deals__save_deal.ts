import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { dealInputSchema } from "../../lib/admin/schemas"
import { fromStoreDateTime } from "../../lib/admin/store-time"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Add a QDeal promotion, or replace an existing one by id. Send the complete deal, including its whole product list in display order. The owner sees the deal card preview and must approve before anything is saved.",
  inputSchema: dealInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      input.id
        ? `Save changes to “${input.title}”?`
        : `Add the deal “${input.title}”?`,
  },
  label: {
    start: ({ id, title }) => (id ? `Edit “${title}”` : `Add “${title}”`),
    complete: (input) => `Saved “${input.title}”`,
  },
  async execute({ id, items, starts_at, ends_at, ...deal }, ctx) {
    const supabase = callerSupabase(ctx)
    const row = {
      ...deal,
      title: deal.title.trim(),
      summary: deal.summary.trim(),
      note: deal.note.trim(),
      starts_at: starts_at && fromStoreDateTime(starts_at),
      ends_at: ends_at && fromStoreDateTime(ends_at),
    }
    const result = id
      ? await supabase.from("deals").update(row).eq("id", id).select("id")
      : await supabase.from("deals").insert(row).select("id")
    if (result.error) throw failure("Deal", result.error)
    const saved = result.data[0]
    if (!saved) {
      throw new Error(
        "Deal: no deal with that id. Look it up again with deals__list_deals."
      )
    }

    // Add the new product list before removing the old one, so a failure
    // never leaves the deal without products.
    const previous = await supabase
      .from("deal_items")
      .select("id")
      .eq("deal_id", saved.id)
    if (previous.error) throw failure("Deal products", previous.error)
    if (items.length > 0) {
      const inserted = await supabase.from("deal_items").insert(
        items.map((item, sort_order) => ({
          deal_id: saved.id,
          sort_order,
          brand: item.brand.trim(),
          name: item.name.trim(),
          condition: item.condition,
          price_cents: item.price_cents,
        }))
      )
      if (inserted.error) throw failure("Deal products", inserted.error)
    }
    const oldIds = previous.data.map((item) => item.id)
    if (oldIds.length > 0) {
      const removed = await supabase
        .from("deal_items")
        .delete()
        .in("id", oldIds)
      if (removed.error) throw failure("Deal products", removed.error)
    }

    const now = Date.now()
    const live =
      deal.status === "published" &&
      (!row.starts_at || Date.parse(row.starts_at) <= now) &&
      (!row.ends_at || Date.parse(row.ends_at) > now)
    return {
      saved: true,
      id: saved.id,
      live,
      url: "/qdeal",
      revalidate: ["deals"],
    }
  },
})
