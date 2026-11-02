---
description: Use before adding, editing, unpublishing, deleting, or reordering shop products or their photos.
---

Load these instructions with `eve__skill({ name: "products" })`. Discover this group with `eve__search({ query: "products__" })` unless its signatures are already in context. Execute the discovered tools with `eve__tool({ name, input })`, using their exact names and signatures. Read current data before writing; reuse discovery while its signatures remain in context. For requests spanning domains, also load the other skill and discover its group as needed.

How the shop catalog works:

- Every product has a `slug` (lowercase words joined by dashes, unique; its page is `/products/<slug>`), a `category_slug` and a `brand_slug` that must already exist (see `products__list_catalog`; new categories and brands need artwork deployed with the site, so they can't be added here), and a `name` of up to 160 characters.
- Copy: `short_description` is the card line (300 characters at most). The details page shows `description_intro` (an intro line), `features` (one bullet each), and `description_closing` (a bold closing line). Leave a part empty ("" or []) rather than padding it.
- Price: `price_cents` is the current selling price (required, positive, in US cents); `msrp_cents` is the manufacturer's list price, or null when unknown. To put a product on sale, keep its MSRP and set `price_cents` below it (for example, 79900 with MSRP 99900 shows a $799 sale price and crossed-out $999 MSRP). Cards, details, and the approval preview label it "Sale price". Equal prices show "MSRP"; a missing MSRP or a selling price above it is not labelled as a sale. Never invent an MSRP to create a sale label. To end a sale, restore the owner's regular selling price; leave MSRP intact. `price_unit` is `each` or `pair` (speakers are usually sold in pairs).
- `condition` is `New`, `Demo`, or `Used`. `ready_for_audition` marks a product the shop can play for visitors. `manufacturer_url` is the brand's product page (https only) or null.
- `status` `published` shows the product in the shop; `draft` hides it. Ask which the owner wants for a new product. Unpublishing (saving as draft) is safer than deleting.
- `sort_order`: lower values show first. Leave it out when editing to keep the product's place; a new product without it gets 0 and shows first. To arrange a whole category or brand, use `products__reorder_products` (below).
- Photos: `images` lists every photo in display order. The first is the card photo and the gallery's lead. Each needs its media `path`, `width`, `height`, and an `alt` text describing the photo (for example "Orbit Theory in walnut, front three-quarter view"). Newly attached photos have `uploads/` paths; saving moves them into `products/` and returns the saved paths, so use those in later edits. Saving replaces the product's whole photo list, so include existing photos you keep.

Steps:

1. Find the product with `products__list_catalog`, then `products__get_product` for its full record. For a new one, check `products__list_catalog` for the category and brand slugs and that the slug is free.
2. Draft the copy. For anything beyond small edits, ask the `copywriter` subagent with the product name, brand, category, condition, and all the owner's notes, specs, or page text.
3. Call `products__save_product` with the complete record (with `id` when editing). The owner previews the product page and approves.
4. After a save, give the product's address (`/products/<slug>`), and mention when it's a draft that won't show in the shop yet.
5. To delete, call `products__delete_product` with the id and name. Photo files stay in storage.

Product order:

- The shop sorts every listing (a category page, a brand page, and all products at `/shop`) by `sort_order`, lowest first. `products__list_catalog` returns products in that order.
- To reorder, call `products__list_catalog` with the category or brand, then `products__reorder_products` with that slug and every product id in the new order, drafts included (they keep their place but stay hidden). The owner previews the listing and approves. It numbers the products 10, 20, 30…, so a later product can slot in between.
- The reorder card is a drag-and-drop list. When the owner wants to reorder but hasn't said the new order, don't ask how (no `ask_question` with orderings): propose the current order right away, and say in one short line that they can drag the products into place. If they rearrange it, they save it from the card themselves, and you get a message with an `Order saved:` line: it's done, so just confirm. When they do name an order, propose it directly.
- One order is shared by all listings, so reordering a category can also shift where its products fall among other categories' products on `/shop` and on brand pages. Say so when it matters, and reorder with neither slug when the owner wants to arrange all products.
