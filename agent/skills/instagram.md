---
description: Use before drafting, scheduling, posting, changing, retrying, or deleting an Instagram post or story, including turning a news post, QDeal, or product into one.
---

Load these instructions with `eve__skill({ name: "instagram" })`. Discover this group with `eve__search({ query: "instagram__" })` unless its signatures are already in context. Execute the discovered tools with `eve__tool({ name, input })`, using their exact names and signatures. Read current data before writing; reuse discovery while its signatures remain in context. For posts made from news, deals, or products, also load that skill and discover its group.

How Instagram posts work:

- Posts go out through Zernio on the shop's connected Instagram account. Start with `instagram__get_account`: pass its username as `account`. If it can't post or needs reconnecting, tell the owner to reconnect in Zernio (the Instagram link beside the quick actions) and stop.
- Photos only for now: no videos or Reels. `kind` `feed` is one photo, or 2–10 as a swipeable carousel; `story` is one photo shown for 24 hours, with no caption and no link.
- Photos come from the media library: attached photos (`uploads/…` with their `Photo uploaded:` size), a product's photos (`products__get_product`), or a news post's cover and images (`news__get_news_post`). Copy `path`, `width`, and `height` exactly, and write each `alt` from what the photo shows.
- The first photo sets the shape, kept between 4:5 (tallest) and 1.91:1 (widest); a taller first photo is cropped to 4:5, and a carousel's other photos are fitted to the first one's frame. `fit` `contain` keeps every photo whole with white bars (black on stories): use it for posters, flyers, photos with text, or when cropping would cut off the product. Stories are 9:16, and a photo that isn't already tall gets black bars unless `fit` is `cover`. The approval card shows the exact crop.
- `when` is `"draft"` (kept in Zernio, not posted), `"now"` (posted once approved), or a store time `"YYYY-MM-DDTHH:MM"` a few minutes to 7 days ahead. For a later date, save a draft and schedule it within the week before. Ask which, unless the owner said. The card's Schedule button sends a message like `Schedule this Instagram post for … when "YYYY-MM-DDTHH:MM"`: call `instagram__save_post` again at once with the same post and that `when`, without asking anything.
- The owner can drag a carousel's photos into a new order on its card. A message ending in a `Photo order: [...]` line (with Schedule) lists the photos in that order: use exactly that list as `photos`. A message ending in an `Approved photo order: [...]` line means the owner approved the post with its photos in that order: call `instagram__save_post` again at once with the same post and exactly that list as `photos`, changing nothing else and asking nothing. The card approves itself only when it matches exactly; don't say it's saved until the tool returns. The owner doesn't see these lines.
- Saving copies attached photos into `instagram/`; `instagram__list_posts` returns each post's saved `photos` and `fit` for edits. Only drafts and scheduled posts Tune made can be changed: send the complete post with its `id`. A post can't switch between feed and story or to another account; delete it and make a new one.
- A failed post says why in `problem`. Once the cause is fixed (for example, the account is reconnected), retry it with `instagram__retry_post`; to change it, delete it and make a new one. Published posts can't be deleted here; the owner removes them in the Instagram app.

Captions (feed posts):

- Write from the owner's words or the source item, keeping its facts exact. Never invent prices, specs, dates, or availability.
- Open with the news: what it is and why it matters. Only the first 125 characters show before "more".
- Plain, confident, and specific, in short paragraphs separated by blank lines. No hype words or exclamation marks; emoji only when the owner asks or prefers them.
- Links aren't clickable in captions. Name the page in words, such as "Details at qaudio.com/news/<slug>" or "qaudio.com/products/<slug>", or invite people to 5 Brookline Street, Cambridge.
- Prices in dollars, as the site shows them. For a deal, include when it runs.
- End with 3 to 6 relevant hashtags (such as #hifi, #vinyl, #turntable, #cambridgema) unless the owner prefers none; 30 at most. @mention a brand only with the handle the owner gives.
- Keep the owner's wording when they write the caption themselves; fix only typos.

Turning site content into a post:

- News post: read it with `news__get_news_post`. Use its cover (and body photos for a carousel), and write the caption from its title and opening, pointing to qaudio.com/news/<slug>.
- Product: read it with `products__get_product`. Use its photos in order (up to 10), and write the caption from what it is, its condition, its price, and whether it's ready to audition, pointing to qaudio.com/products/<slug>.
- QDeal: read it with `deals__list_deals`. Deals have no photos of their own: use photos of the listed products (find them with `products__list_catalog`, then `products__get_product`) or ask the owner to attach one. The caption names the deal, its products and prices, and its dates.

Steps:

1. Call `instagram__get_account`.
2. Read the source item and gather its photos and facts, or use the attached photos.
3. Ask with `ask_question` for anything unclear: which photos, feed or story, and when.
4. Call `instagram__save_post` with the complete post. The owner sees it as Instagram will show it and approves; if they decline, ask what to change and propose again.
5. To find, change, or remove a post, list them with `instagram__list_posts` (filter by status), then save with its `id`, or call `instagram__delete_post` or `instagram__retry_post` with its `id` and a short `summary` for the approval card.
