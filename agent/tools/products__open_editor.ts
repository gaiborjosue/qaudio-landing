import { defineTool } from "eve/tools"
import { readProduct } from "../../lib/admin/product-save"
import { openProductEditorInputSchema } from "../../lib/admin/schemas"
import { callerSupabase, failure } from "../lib/supabase"

export default defineTool({
  deferred: true,
  description:
    "Open the product editor in the chat: a form for one product (category, brand, condition, audition, status, photos, name, prices, copy, manufacturer link) with a live preview. Omit id to add a product; give an id to edit one (its saved record fills the form). Put whatever you know or drafted in `draft`. The owner completes it and saves it there themselves, so this saves nothing and needs no approval; don't follow it with products__save_product. After opening it, say at most one short line and stop.",
  inputSchema: openProductEditorInputSchema,
  label: {
    start: ({ id }) => (id ? "Open the product" : "Open a new product"),
    complete: ({ id }) => (id ? "Opened the product" : "Opened a new product"),
  },
  async execute({ id, draft }, ctx) {
    const saved = id
      ? await readProduct(callerSupabase(ctx), { id }, failure)
      : null
    if (id && !saved) {
      throw new Error(
        "Product: no product with that id. Look it up again with products__list_catalog."
      )
    }
    return {
      opened: true,
      // The form's starting values; the owner's edits from here on happen
      // in the chat, and a later message says when it's saved.
      product: { ...saved, ...draft, ...(id && { id }) },
    }
  },
})
