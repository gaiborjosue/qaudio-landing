import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { saleDiscountLabel, saveSale } from "../../lib/admin/sale"
import { saleProposalSchema } from "../../lib/admin/schemas"
import { productSaleFlow } from "../lib/product-sale-flow"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

const count = (n: number) => `${n} product${n === 1 ? "" : "s"}`

// The one product change the agent makes: a time-limited sale price. The
// regular price and MSRP stay; the site shows the sale price only inside
// its window, so the sale ends by itself.
export default defineTool({
  deferred: true,
  description:
    "Put products on a time-limited sale: each gets a sale price (worked out from discount, or the owner's own price per product) shown on the site from starts_at until ends_at, after which its regular price shows again by itself. Regular prices and MSRP don't change. Copy each product's id, name, price_cents, and msrp_cents exactly from products__list_catalog. A new sale replaces a product's earlier one. In the Product sale flow link the approved, saved news post with news_post_id and use its approved publication time for starts_at. The owner sees the products with their sale prices and approves first.",
  inputSchema: saleProposalSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      `Put ${count(input.products.length)} on sale: ${saleDiscountLabel(input)}?`,
  },
  label: {
    start: (input) => `Set sale prices for ${count(input.products.length)}`,
    complete: (input) =>
      `Saved sale prices for ${count(input.products.length)}`,
  },
  async execute(input, ctx) {
    const flow = productSaleFlow.get()
    if (
      flow.step === "prices" &&
      (input.news_post_id ?? null) !== flow.newsPostId
    ) {
      throw new Error(
        flow.newsPostId
          ? `Link the saved news post using news_post_id ${flow.newsPostId} and propose the prices again.`
          : "The news step saved no post. Propose the prices without news_post_id."
      )
    }
    const lines = await saveSale(callerSupabase(ctx), input, failure)
    return refreshAfterSave(ctx, {
      saved: true,
      products: lines.map((line) => ({
        id: line.id,
        name: line.name,
        sale_price_cents: line.sale_price_cents,
      })),
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      revalidate: ["catalog", "news"],
    })
  },
})
