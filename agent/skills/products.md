---
description: Use before answering questions about shop products or reordering them, and when the owner asks to add, edit, publish, unpublish, or delete one.
---

Load these instructions with `eve__skill({ name: "products" })`. Discover this group with `eve__search({ query: "products__" })` unless its signatures are already in context. Execute the discovered tools with `eve__tool({ name, input })`, using their exact names and signatures. Reuse discovery while its signatures remain in context. For requests spanning domains, also load the other skill and discover its group as needed.

What you can do with products:

- Read them: `products__list_catalog` lists categories, brands, and every product (drafts included) in the shop's order; `products__get_product` reads one product with every field and its photos.
- Reorder them with `products__reorder_products` (below).

Adding, editing, publishing, unpublishing, and deleting products is done by the owner in the admin's Products tab (the Chat / Products switch at the top of the page): a table with filters, a sheet with the full product form, and Delete. You have no tool for it. When the owner asks for one of those, say in one short line that it's in the Products tab; don't collect the product's details or offer to save it. If they ask you to write a product's copy from notes, a spec sheet, or a manufacturer page, ask the `copywriter` subagent and give them its description and card line to paste into the form.

How the shop catalog works:

- Every product has a `slug` (its page is `/products/<slug>`), a category and a brand, a `name`, a card line (`short_description`), and a Markdown `description`.
- Price: `price_cents` is the current selling price in US cents, and `msrp_cents` the manufacturer's list price or null. A selling price below MSRP shows as a sale. `price_unit` is `each` or `pair`. Say prices in dollars.
- `condition` is `New`, `Demo`, or `Used`. `status` `published` shows the product in the shop; `draft` hides it.

Product order:

- The shop sorts every listing (a category page, a brand page, and all products at `/shop`) by `sort_order`, lowest first. `products__list_catalog` returns products in that order.
- To reorder, call `products__list_catalog` with the category or brand, then `products__reorder_products` with that slug and every product id in the new order, drafts included (they keep their place but stay hidden). The owner previews the listing and approves. It numbers the products 10, 20, 30…, so a later product can slot in between.
- The reorder card is a drag-and-drop list. When the owner wants to reorder but hasn't said the new order, don't ask how (no `ask_question` with orderings): propose the current order right away, and say in one short line that they can drag the products into place. If they rearrange it, they save it from the card themselves, and you get a message with an `Order saved:` line: it's done, so just confirm. When they do name an order, propose it directly.
- One order is shared by all listings, so reordering a category can also shift where its products fall among other categories' products on `/shop` and on brand pages. Say so when it matters, and reorder with neither slug when the owner wants to arrange all products.
