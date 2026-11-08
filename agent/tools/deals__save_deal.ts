import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { dealInputSchema } from "../../lib/admin/schemas"
import { fromStoreDateTime } from "../../lib/admin/store-time"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"
import { placeUploads } from "../lib/media"

export default defineTool({
  deferred: true,
  description:
    "Add a QDeal promotion, or replace an existing one by id. Supports one image/flyer, text, product rows, or a combination; items may be empty. Send the whole product list in display order and reuse the existing image unless asked to change it (null removes it; omission preserves it). The owner previews the deal card and must approve before anything is saved.",
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
  async execute({ id, items, image, starts_at, ends_at, ...deal }, ctx) {
    const supabase = callerSupabase(ctx)
    const place = await placeUploads(
      supabase,
      image ? [image.path] : [],
      "deals"
    )
    const row = {
      ...deal,
      title: deal.title.trim(),
      summary: deal.summary.trim(),
      note: deal.note.trim(),
      starts_at: starts_at && fromStoreDateTime(starts_at),
      ends_at: ends_at && fromStoreDateTime(ends_at),
      ...(image !== undefined && {
        image_path: image ? place(image.path) : null,
        image_width: image?.width ?? null,
        image_height: image?.height ?? null,
        image_alt: image?.alt.trim() ?? "",
      }),
    }
    const columns = "id, image_path, image_width, image_height, image_alt"
    const result = id
      ? await supabase.from("deals").update(row).eq("id", id).select(columns)
      : await supabase.from("deals").insert(row).select(columns)
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
    return refreshAfterSave(ctx, {
      saved: true,
      id: saved.id,
      image:
        saved.image_path && saved.image_width && saved.image_height
          ? {
              path: saved.image_path,
              width: saved.image_width,
              height: saved.image_height,
              alt: saved.image_alt,
            }
          : null,
      live,
      url: "/qdeal",
      revalidate: ["deals"],
    })
  },
})
