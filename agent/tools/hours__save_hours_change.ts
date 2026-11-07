import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { hoursChangeInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

export default defineTool({
  deferred: true,
  description:
    "Add a schedule change (special hours, appointment-only days, or a closure for one or more dates), or edit one by id. It overrides the regular week for those dates and shows on the site as a schedule-change notice from 60 days before until it ends. The owner previews and approves it before it's saved.",
  inputSchema: hoursChangeInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      input.id ? "Save this schedule change?" : "Add this schedule change?",
  },
  label: {
    start: ({ id }) =>
      id ? "Edit a schedule change" : "Add a schedule change",
    complete: () => "Saved the schedule change",
  },
  async execute({ id, ...change }, ctx) {
    const supabase = callerSupabase(ctx)
    const row = {
      starts_on: change.starts_on,
      ends_on: change.ends_on,
      kind: change.kind,
      opens_at: change.kind === "open" ? change.opens_at! : null,
      closes_at: change.kind === "open" ? change.closes_at! : null,
      note: change.note.trim(),
    }
    const result = id
      ? await supabase
          .from("store_hours_changes")
          .update(row)
          .eq("id", id)
          .select("id")
      : await supabase.from("store_hours_changes").insert(row).select("id")
    if (result.error) throw failure("Schedule change", result.error)
    const saved = result.data[0]
    if (!saved) {
      throw new Error(
        "Schedule change: no change with that id. Read the hours again with hours__get_store_hours."
      )
    }
    return refreshAfterSave(ctx, {
      saved: true,
      id: saved.id,
      revalidate: ["store-hours"],
    })
  },
})
