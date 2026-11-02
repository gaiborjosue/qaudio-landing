import { defineTool } from "eve/tools"
import { z } from "zod"
import { STORE_TIME_ZONE, WEEKDAYS, storeClock } from "../../lib/store-hours"
import { callerSupabase, failure } from "../lib/supabase"

const hhmm = (time: string | null) => time?.slice(0, 5) ?? null

export default defineTool({
  deferred: true,
  description:
    "Read the store's regular weekly hours (Monday first) and every schedule change (special hours or closure) that hasn't ended, with ids. Read this before changing hours.",
  inputSchema: z.object({}),
  label: { start: () => "Read store hours" },
  async execute(_input, ctx) {
    const supabase = callerSupabase(ctx)
    const today = storeClock(new Date()).date
    const [week, changes] = await Promise.all([
      supabase
        .from("store_weekly_hours")
        .select("weekday, kind, opens_at, closes_at")
        .order("weekday"),
      supabase
        .from("store_hours_changes")
        .select("id, starts_on, ends_on, kind, opens_at, closes_at, note")
        .gte("ends_on", today)
        .order("starts_on"),
    ])
    if (week.error) throw failure("Store hours", week.error)
    if (changes.error) throw failure("Schedule changes", changes.error)
    return {
      today,
      timeZone: STORE_TIME_ZONE,
      week: week.data.map((row) => ({
        day: WEEKDAYS[row.weekday],
        kind: row.kind,
        opens_at: hhmm(row.opens_at),
        closes_at: hhmm(row.closes_at),
      })),
      changes: changes.data.map((row) => ({
        id: row.id,
        starts_on: row.starts_on,
        ends_on: row.ends_on,
        kind: row.kind,
        opens_at: hhmm(row.opens_at),
        closes_at: hhmm(row.closes_at),
        note: row.note,
      })),
    }
  },
})
