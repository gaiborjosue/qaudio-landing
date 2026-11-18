---
description: Use before adding, editing, scheduling, ending, or deleting a QDeal or a featured sale on the Sales page. Deals can use an uploaded image/flyer, text, product rows, or a combination.
---

Load these instructions with `eve__skill({ name: "deals" })`. Discover this group with `eve__search({ query: "deals__" })` unless its signatures are already in context. Execute the discovered tools with `eve__tool({ name, input })`, using their exact names and signatures. Read current data before writing; reuse discovery while its signatures remain in context. For requests spanning domains, also load the other skill and discover its group as needed.

Two kinds of deal (`kind`):

- `qdeal`: a QDeal, a Q Audio-only opportunity such as closeouts or discounted used gear. `/qdeal` lists live QDeals as cards, lowest `sort_order` first, above the page's fixed advice text. With none live, the page shows only the text.
- `sale`: a featured sale, a promotion such as a brand's seasonal discount (often its flyer). `/sales` shows live featured sales as cards, with their end date, above every product with a live sale price. Products appear there by themselves while their sale (`products__save_sale`) runs; a featured sale is the promotion's banner, not the prices. Give it the sale's dates, so it ends with the sale.
- A new deal without `kind` is a QDeal; an edit without it keeps its kind. Choose from the owner's words: a brand or store-wide promotion is `sale`, an offer only Q Audio has is `qdeal`. Ask with `ask_question` when it's unclear.

How deals work:

- Each deal has a short `title`, optional `summary` (a line under the title), one optional `image`, optional product rows, and an optional `note` along the card's foot (such as "Visit us for pricing."). An image/flyer with just a title is valid: use `items: []`, `summary: ""`, and `note: ""`. Text-only and product-list deals are also valid. Follow the owner's chosen format; don't turn a flyer into product rows or duplicate its text unless asked.
- Photos arrive as `Photo uploaded:` lines. Inspect with `view_photos` before using them; copy their exact path, width, and height into `image`, and write alt text from what it shows. A saved deals/, products/, news/, or instagram/ photo can also be reused. The card preserves the complete image and its colors; no generated QDeal images. If several photos are attached, ask which one to feature when unclear.
- Each product row has an optional `brand` label, a `name`, an optional `condition` (`new`, `demo`, or `used`, shown as a pill), an optional `price_cents` (US cents; null shows no price), and an optional `product_id`: when the row is a shop product, its id from `products__list_catalog`, so the row links to its page. Don't invent prices; leave them null and use the note when the owner wants visitors to ask.
- The owner can also edit deals directly in the admin's Deals tab. That tab and you save the same deals, so read before changing one.
- `status` `published` shows the deal; `draft` hides it. `starts_at` and `ends_at` are optional store-time `"YYYY-MM-DDTHH:MM"` limits: the deal appears at `starts_at` and disappears at `ends_at` by itself. Ending a deal early means setting `ends_at` to now, or saving it as a draft.

Steps:

1. Call `deals__list_deals` for every deal (drafts, scheduled, live, and expired) with ids, dates, images, and products. On edits, carry its image forward exactly unless the owner replaces or removes it. Set `image: null` only to remove it; omitting image keeps the existing one.
2. Resolve dates ("through Black Friday weekend") against today's store date and say the exact times back. An end date usually means the end of that day: use `T23:59`.
3. Don't ask whether to publish or keep a draft: approving, the owner picks Publish, Save draft, or Schedule (its start) on the card. Use what the owner said; otherwise propose a new deal as `published`, and keep an edited deal's own `status`.
4. Call `deals__save_deal` with the complete deal, including `image` and the whole product list in order (with `id` and its `updated_at` when editing). It refuses a deal that changed since you read it: read it again and propose on the current deal. The owner previews the same card visitors see and approves, or denies with a note on what to change. Use the saved image path returned by the tool for later edits.
5. To delete, call `deals__delete_deal` with the id and title. Saving as a draft keeps it for next time.
6. A new featured sale's card also offers Don't feature. A denial whose note starts with `Skip step:` means the owner doesn't want it on the Sales page: don't propose it again or ask why, and go on (in a flow, mark that step skipped).
