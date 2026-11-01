import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import type { DayHours, HoursChange, StoreSchedule } from "@/lib/store-hours"
import { publicSupabase } from "@/lib/supabase/public"

// Store hours from Supabase, read as an anonymous visitor. Results are cached
// under STORE_HOURS_CACHE_TAG with the "content" profile (5 minutes); admin
// Server Actions will call updateTag(STORE_HOURS_CACHE_TAG) after a save so
// edits show up right away.
export const STORE_HOURS_CACHE_TAG = "store-hours"

type HoursRow = {
  kind: string
  opens_at: string | null
  closes_at: string | null
}

// Postgres times come back as "HH:MM:SS".
function toDayHours(row: HoursRow): DayHours {
  if (row.kind === "open" && row.opens_at && row.closes_at) {
    return { open: row.opens_at.slice(0, 5), close: row.closes_at.slice(0, 5) }
  }
  return row.kind === "appointment" ? "appointment" : "closed"
}

/** The regular week (Monday first) and the changes that haven't ended. */
export async function getStoreSchedule(): Promise<StoreSchedule> {
  "use cache"
  cacheLife("content")
  cacheTag(STORE_HOURS_CACHE_TAG)
  const supabase = publicSupabase()
  // Two days back covers the gap between UTC and store dates; the visit
  // section drops changes that ended before the visitor's store-time today.
  const since = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10)
  const [week, changes] = await Promise.all([
    supabase
      .from("store_weekly_hours")
      .select("weekday, kind, opens_at, closes_at")
      .order("weekday"),
    supabase
      .from("store_hours_changes")
      .select("starts_on, ends_on, kind, opens_at, closes_at, note")
      .gte("ends_on", since)
      .order("starts_on"),
  ])
  if (week.error) throw new Error(`Store hours: ${week.error.message}`)
  if (changes.error) {
    throw new Error(`Store hour changes: ${changes.error.message}`)
  }

  const weekly: DayHours[] = Array.from({ length: 7 }, () => "closed")
  for (const row of week.data) weekly[row.weekday] = toDayHours(row)

  return {
    weekly,
    changes: changes.data.map((row): HoursChange => ({
      start: row.starts_on,
      ...(row.ends_on !== row.starts_on && { end: row.ends_on }),
      hours: toDayHours(row),
      ...(row.note && { note: row.note }),
    })),
  }
}
