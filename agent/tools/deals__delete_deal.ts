import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { deleteDealInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Permanently delete a QDeal promotion and its products by id. To hide it but keep it, save it as a draft or let its end date pass. The owner approves first.",
  inputSchema: deleteDealInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) => `Delete the deal “${input.title}”?`,
  },
  label: {
    start: ({ title }) => `Delete “${title}”`,
    complete: (input) => `Deleted “${input.title}”`,
  },
  async execute({ id }, ctx) {
    const supabase = callerSupabase(ctx)
    const { data, error } = await supabase
      .from("deals")
      .delete()
      .eq("id", id)
      .select("id")
    if (error) throw failure("Deal", error)
    if (data.length === 0) {
      throw new Error("Deal: nothing deleted; no deal has that id.")
    }
    return { deleted: true, revalidate: ["deals"] }
  },
})
