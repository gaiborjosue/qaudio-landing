---
description: Use before adding, editing, scheduling, ending, or deleting a QDeal promotion or its products.
---

How QDeal works:

- `/qdeal` lists live deals as cards, lowest `sort_order` first, above the page's fixed advice text. With no live deal, the page shows only the text.
- Each deal has a `title`, an optional `summary` (a short line under the title), its products, and an optional `note` along the card's foot (such as "Visit us for pricing.").
- Each product row has an optional `brand` label, a `name`, an optional `condition` (`new` or `demo`, shown as a pill), and an optional `price_cents` (US cents; null shows no price). Don't invent prices; leave them null and use the note when the owner wants visitors to ask.
- `status` `published` shows the deal; `draft` hides it. `starts_at` and `ends_at` are optional store-time `"YYYY-MM-DDTHH:MM"` limits: the deal appears at `starts_at` and disappears at `ends_at` by itself. Ending a deal early means setting `ends_at` to now, or saving it as a draft.

Steps:

1. Call `list_deals` for every deal (drafts, scheduled, live, and expired) with ids, dates, and products.
2. Resolve dates ("through Black Friday weekend") against today's store date and say the exact times back. An end date usually means the end of that day: use `T23:59`.
3. Call `save_deal` with the complete deal, including the whole product list in order (with `id` when editing). The owner previews the card and approves.
4. To delete, call `delete_deal` with the id and title. Saving as a draft keeps it for next time.
