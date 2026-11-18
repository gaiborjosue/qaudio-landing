import { defineTool } from "eve/tools"
import { z } from "zod"
import { readManufacturerPage } from "../lib/product-page"

// Prefill with Tune, as a tool: reads a manufacturer's page and returns
// suggestions to propose, never a save. Paid (Tavily and the fast model),
// so it verifies the admin first and never throws.
export default defineTool({
  deferred: true,
  description:
    "Read a manufacturer's product page and suggest a product's fields (name, brand_slug, category_slug, msrp_cents, price_unit, Markdown description, card line) and up to 5 photos, staged like the owner's uploads, with their width, height, and alt text. Use it when the owner gives a manufacturer page for a new product, or asks to fill in or refresh one from its page. It saves nothing: look at the photos with view_photos, then propose with products__create_product or products__update_products, keeping the owner's own details. Takes up to a minute and costs money, so call it once per page; never retry a failure automatically.",
  inputSchema: z.object({
    url: z
      .string()
      .max(2000)
      .describe("The manufacturer's product page, https://."),
    photos_kept: z
      .int()
      .min(0)
      .max(20)
      .default(0)
      .describe(
        "How many photos the product keeps (0 for a new one); a product holds 20."
      ),
  }),
  label: {
    start: () => "Read the manufacturer’s page",
    complete: (_input, output) =>
      output && "problem" in output
        ? "Couldn’t read the manufacturer’s page"
        : "Read the manufacturer’s page",
  },
  async execute({ url, photos_kept }, ctx) {
    return readManufacturerPage(url, photos_kept, ctx)
  },
})
