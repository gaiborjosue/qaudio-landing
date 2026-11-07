import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { weeklyHoursInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

export default defineTool({
  deferred: true,
  description:
    "Replace the regular weekly hours. Send all seven days, Monday first, including unchanged ones. The owner sees a preview of the site's hours list and must approve before anything is saved.",
  inputSchema: weeklyHoursInputSchema,
  approval: {
    request: always(),
    prompt: () => "Save these regular weekly hours?",
  },
  label: {
    start: () => "Update weekly hours",
    complete: () => "Updated weekly hours",
  },
  async execute({ week }, ctx) {
    const supabase = callerSupabase(ctx)
    const results = await Promise.all(
      week.map((day, weekday) =>
        supabase
          .from("store_weekly_hours")
          .update({
            kind: day.kind,
            opens_at: day.kind === "open" ? day.opens_at! : null,
            closes_at: day.kind === "open" ? day.closes_at! : null,
          })
          .eq("weekday", weekday)
          .select("weekday")
      )
    )
    for (const result of results) {
      if (result.error) throw failure("Weekly hours", result.error)
      if (result.data.length !== 1) {
        throw new Error(
          "Weekly hours: a day wasn't saved. Only site admins can edit hours."
        )
      }
    }
    return refreshAfterSave(ctx, { saved: true, revalidate: ["store-hours"] })
  },
})
