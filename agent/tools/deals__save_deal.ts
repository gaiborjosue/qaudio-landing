import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { saveDeal } from "../../lib/admin/deal-save"
import { dealInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

export default defineTool({
  deferred: true,
  description:
    "Add a QDeal (kind qdeal, on /qdeal) or a featured sale (kind sale, on /sales above the products on sale), or replace an existing one by id, with its updated_at from deals__list_deals. Supports one image/flyer, text, product rows, or a combination; items may be empty. Send the whole product list in display order and reuse the existing image unless asked to change it (null removes it; omission preserves it). The owner previews the deal card and must approve before anything is saved.",
  inputSchema: dealInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      input.id
        ? `Save changes to “${input.title}”?`
        : input.kind === "sale"
          ? `Feature “${input.title}” on the Sales page?`
          : `Add the deal “${input.title}”?`,
  },
  label: {
    start: ({ id, title }) => (id ? `Edit “${title}”` : `Add “${title}”`),
    complete: (input) => `Saved “${input.title}”`,
  },
  async execute(input, ctx) {
    const saved = await saveDeal(callerSupabase(ctx), input, failure)
    return refreshAfterSave(ctx, {
      saved: true,
      ...saved,
      revalidate: ["deals"],
    })
  },
})
