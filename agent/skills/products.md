---
description: Use before answering questions about shop products, and when the owner asks to add a product, change products (hide or show, publish or unpublish, prices, condition, availability, audition, copy, photos, category, brand), reorder them, or put them on sale (or end a sale).
---

Load these instructions with `eve__skill({ name: "products" })`. Discover this group with `eve__search({ query: "products__" })` unless its signatures are already in context. Execute the discovered tools with `eve__tool({ name, input })`, using their exact names and signatures. Reuse discovery while its signatures remain in context. For requests spanning domains, also load the other skill and discover its group as needed.

What you can do with products:

- Read them: `products__list_catalog` lists categories, brands, and every product (drafts included) in the shop's order; `products__get_product` reads one product with every field and its photos.
- Change them with `products__update_products`: one product or many in one card (below).
- Add one with `products__create_product` (below), after reading its manufacturer page with `products__read_manufacturer_page` when the owner gives one.
- Reorder them with `products__reorder_products` (below).
- Put them on a time-limited sale with `products__save_sale`, or end a sale early with `products__end_sale` (below).

Deleting a product has no tool: it's the bin in the admin's Products tab. When the owner asks to delete one, offer to hide it (a draft) instead, and say in one short line that deleting is in the Products tab. Categories and brands are edited in the Metadata tab.

How the shop catalog works:

- Every product has a `slug` (its page is `/products/<slug>`), a category and an optional brand, a `name`, a card line (`short_description`), and a Markdown `description`.
- Price: `price_cents` is the regular selling price in US cents, and `msrp_cents` the manufacturer's list price or null. A selling price below MSRP shows as a sale. `price_unit` is `each` or `pair`. Say prices in dollars. A null price means no quoted selling price (price on request); never replace it with MSRP or a number from the teaser. Preserve `price_note` (starting-at, each/pair, final sale). Missing brands/logos are intentional; never infer them from names.
- Availability can be `available`, `back_order`, `sold`, or `unavailable`. Back Order means the item is available to order and awaiting stock. A published item on back order stays visible with its price and the Back Order label. Do not offer sold or unavailable stock or put unpriced listings on a sale.
- `sale` is a time-limited sale, if any: its `price_cents` shows instead of the regular price from `starts_at` (null: as soon as it's saved) until `ends_at`, store time, and then the regular price shows again by itself. A sale that has ended stays listed until a new one replaces it. While a sale runs, the product is also listed on the Sales page (`/sales`), under any featured sales (the `deals` skill).
- `condition` is `New`, `Demo`, or `Used`. Used gear has a visual condition score out of 10, kept in `condition_note` as "N out of 10" beside any other terms ("Used (final sale) · 6 out of 10"). `status` `published` shows the product in the shop; `draft` hides it. Used gear that's sold is always saved as a draft.
- `ready_for_audition` marks products the owner can demo in the shop.
- There's no product line field: a line ("Paradigm Monitor SE") is the brand plus a name match, so find it with `products__list_catalog` (`brand_slug` and `search`) and check the names.

Changing products:

- Find them first: `products__list_catalog` (with `brand_slug`, `category_slug`, `search`, or `status`) for the short fields, or `products__get_product` for copy and photos. Then call `products__update_products` once for the whole request (up to 100 products), each with its `id`, current `name`, and `updated_at` exactly as read, and in `changes` only the fields that change. "Hide all Thorens" is every published Thorens product with `changes: { status: "draft" }`, in one card.
- Propose straight away; the card shows each product's change and is the question. If the request matches no products, say so instead. If it's unclear which ones, ask with `ask_question`.
- The save refuses products that changed since you read them. Read them again and propose on the current values. After a save, use its returned `updated_at` for that product's next change.
- `price_cents` here is the regular price. Change it only when the owner says the regular price itself changes ("it's $1,199 now", "raise Rega prices 5%"). Any sale, discount, or promotion is a sale (`products__save_sale`, and the product-sale flow), never a regular price change. A regular price must stay above the product's current sale price; end or change the sale first.
- Hiding a product that's in a sale linked to a news post can end that post early, when it was the post's last product in the shop; mention it when that applies.
- `condition_score` sets used gear's score (0 to 10; null removes it), keeping the note's other terms. Use `condition_note` only to change those other terms, and keep the score in it.
- `slug` changes the page address and breaks links to the old one: only when the owner asks for a new address.
- Copy: ask the `copywriter` subagent for a new description and card line from the owner's notes, a spec sheet, or a manufacturer page; keep the owner's own wording when they give it. Change only the copy the owner asked about.
- Photos: `images` is the complete new list in display order, and the first is the card photo. Get the current list with `products__get_product` and keep each saved photo exactly as it's listed (path, alt, width, height, caption). Add the owner's photos (their `Photo uploaded:` path, width, and height, after looking at them with `view_photos`) with alt text you write from what each shows. Leave a photo out to remove it. A product holds 20.

Adding a product:

- With a manufacturer page, call `products__read_manufacturer_page` once with its address (it takes up to a minute and costs money; never retry a failure by yourself), look at its photos with `view_photos`, and use its suggestions where the owner hasn't said otherwise. It saves nothing.
- `products__create_product` needs the category and brand (slugs from `products__list_catalog`; a brand only when it's in the list), name (brand, then model), `slug` (from the name, unused by another product), condition, prices (the selling price only when the owner gives one; else null), unit, audition, the manufacturer page or null, the card line and Markdown description (from the copywriter, or the page's suggestions), and the photos with alt text.
- Publish it when the owner wants it in the shop; otherwise add it as a draft, and say so in a few words. Ask with `ask_question` only when the category or condition isn't clear. It's listed first in the shop until the owner reorders.

Sales:

- `products__save_sale` takes the products exactly as `products__list_catalog` gave them (`id`, `name`, `price_cents`, `msrp_cents`), a `discount` (a `percent`, or an `amount` in cents) and what it comes `off`: `msrp` (the list price, or the regular price for a product without one) or `price`. Promotions "off MSRP" or "off list" are `msrp`. When the owner names a product's own sale price, give it as that product's `sale_price_cents`. `rounding` `dollar` rounds each sale price to whole dollars, when the owner wants that.
- `starts_at` is `"now"` or a store time, `ends_at` a store time; the end of a day is `T23:59`. If you don't know when it ends, ask with `ask_dates`.
- A sale price must be below the product's regular price; the approval card lists any product that can't take it, and the tool refuses until it's left out. The card shows each product as the shop will, with its sale price, and approving saves exactly that. A new sale replaces a product's earlier one.
- To end a sale early, call `products__end_sale` with the products; one that runs to its end needs nothing.

Product order:

- The shop sorts every listing (a category page, a brand page, and all products at `/shop`) by `sort_order`, lowest first. `products__list_catalog` returns products in that order.
- To reorder, call `products__list_catalog` with the category or brand, then `products__reorder_products` with that slug and every product id in the new order, drafts included (they keep their place but stay hidden). The owner previews the listing and approves. It numbers the products 10, 20, 30…, so a later product can slot in between.
- The reorder card is a drag-and-drop list. When the owner wants to reorder but hasn't said the new order, don't ask how (no `ask_question` with orderings): propose the current order right away, and say in one short line that they can drag the products into place. If they rearrange it, they save it from the card themselves, and you get a message with an `Order saved:` line: it's done, so just confirm. When they do name an order, propose it directly.
- One order is shared by all listings, so reordering a category can also shift where its products fall among other categories' products on `/shop` and on brand pages. Say so when it matters, and reorder with neither slug when the owner wants to arrange all products.
