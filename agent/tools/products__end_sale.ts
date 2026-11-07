import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { endSale } from "../../lib/admin/sale"
import { endSaleInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

const count = (n: number) => `${n} product${n === 1 ? "" : "s"}`

export default defineTool({
  deferred: true,
  description:
    "End products' time-limited sales now: their regular prices show again. Only for ending early; a sale ends by itself at its ends_at. products__list_catalog shows each product's sale.",
  inputSchema: endSaleInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `End the sale on ${count(input.products.length)} now?`,
  },
  label: {
    start: (input) => `End the sale on ${count(input.products.length)}`,
    complete: (input) => `Ended the sale on ${count(input.products.length)}`,
  },
  async execute(input, ctx) {
    const ended = await endSale(callerSupabase(ctx), input, failure)
    return refreshAfterSave(ctx, {
      saved: true,
      ended,
      revalidate: ["catalog"],
    })
  },
})
