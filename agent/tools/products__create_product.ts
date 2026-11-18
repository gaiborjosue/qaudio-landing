import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import { isUsedEquipment } from "../../lib/catalog"
import { withConditionScore } from "../../lib/admin/condition-score"
import { saveProduct } from "../../lib/admin/product-save"
import { createProductInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"
import { refreshAfterSave } from "../lib/site-cache"

// A new product, as the Products tab's form adds one. Its sale and place in
// the shop's order come afterwards, from their own tools.
export default defineTool({
  deferred: true,
  description:
    "Add a new product: its category and brand slugs from products__list_catalog, name, address (slug), condition, prices in US cents (price_cents null for price on request), unit, audition, manufacturer page, card line and Markdown description (ask the copywriter for both), and photos in display order (the owner's `Photo uploaded:` paths, or products__read_manufacturer_page's, with their width and height and alt text you write). status draft keeps it hidden; published puts it in the shop. It's listed first until the shop is reordered. The owner sees the product and approves first.",
  inputSchema: createProductInputSchema,
  approval: {
    request: always(),
    prompt: ({ input }) =>
      input.status === "published"
        ? `Add “${input.name}” to the shop?`
        : `Add “${input.name}” as a draft?`,
  },
  label: {
    start: ({ name }) => `Add “${name}”`,
    complete: ({ name }) => `Added “${name}”`,
  },
  async execute({ condition_score, ...product }, ctx) {
    const note = product.condition_note ?? ""
    const saved = await saveProduct(
      callerSupabase(ctx),
      {
        ...product,
        condition_note:
          condition_score === undefined
            ? note
            : withConditionScore(note, condition_score),
      },
      failure
    )
    // Used gear added as sold is saved as a draft.
    const status =
      product.availability === "sold" &&
      isUsedEquipment(product.category_slug, product.condition)
        ? "draft"
        : product.status
    return refreshAfterSave(ctx, {
      saved: true,
      id: saved.id,
      slug: saved.slug,
      status,
      url: `/products/${saved.slug}`,
      live: status === "published",
      // Saved photo paths; use these (not uploads/) in later changes.
      images: saved.images,
      revalidate: ["catalog", "news"],
    })
  },
})
