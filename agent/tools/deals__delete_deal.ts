import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { deleteDeal } from "../../lib/admin/deal-save"
import { deleteDealInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

export default defineTool({
  deferred: true,
  description:
    "Permanently delete a QDeal or featured sale and its products by id. To hide it but keep it, save it as a draft or let its end date pass. The owner approves first.",
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
    if (!(await deleteDeal(callerSupabase(ctx), id, failure))) {
      throw new Error("Deal: nothing deleted; no deal has that id.")
    }
    return refreshAfterSave(ctx, { deleted: true, revalidate: ["deals"] })
  },
})
