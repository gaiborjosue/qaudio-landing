import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { deleteHoursChangeInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Remove a schedule change by id, so the regular hours apply again on its dates. The owner approves first.",
  inputSchema: deleteHoursChangeInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) => `Remove the schedule change “${input.summary}”?`,
  },
  label: {
    start: () => "Remove a schedule change",
    complete: () => "Removed the schedule change",
  },
  async execute({ id }, ctx) {
    const supabase = callerSupabase(ctx)
    const { data, error } = await supabase
      .from("store_hours_changes")
      .delete()
      .eq("id", id)
      .select("id")
    if (error) throw failure("Schedule change", error)
    if (data.length === 0) {
      throw new Error(
        "Schedule change: nothing removed; no change has that id."
      )
    }
    return { removed: true, revalidate: ["store-hours"] }
  },
})
