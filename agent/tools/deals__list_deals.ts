import { defineTool } from "eve/tools"
import { z } from "zod"
import { dealLive, readDeals } from "../../lib/admin/deal-save"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "List every deal (drafts, scheduled, live, and expired): QDeals (kind qdeal, on /qdeal) and featured sales (kind sale, on /sales), with each one's image path/dimensions/alt text, products in order (with any linked product_id), store-time dates, and updated_at for saving. Read it before changing a deal; reuse its image unless the owner replaces or removes it.",
  inputSchema: z.object({}),
  label: { start: () => "Read the deals" },
  async execute(_input, ctx) {
    const now = Date.now()
    const deals = await readDeals(callerSupabase(ctx), failure)
    return {
      deals: deals.map((deal) => ({ ...deal, live: dealLive(deal, now) })),
    }
  },
})
