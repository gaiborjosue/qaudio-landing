---
description: Use before adding, editing, scheduling, publishing, unpublishing, or deleting a news post.
---

How news posts work:

- Each post has a `slug` (lowercase words joined by dashes, unique; its page is `/news/<slug>`), a `title` (200 characters at most), a `cover` photo, `body` blocks, a `status`, and `published_at`.
- The `/news` feed shows published posts newest first as cards: the cover photo, the date, the title, and an excerpt. The excerpt is written automatically from the opening paragraphs, so put the essentials first.
- `status` `published` with `published_at` in the past shows the post; a future `published_at` schedules it (it appears on its own at that time). `draft` hides it. A published post needs a cover and `published_at`.
- `published_at` is store time, `"YYYY-MM-DDTHH:MM"`, or `"now"` to publish when the owner approves. When editing, send back the post's existing `published_at` unless the owner wants it changed.
- `cover`: `path`, `width`, `height`, `alt` (what the photo shows), and `fit`: `cover` crops to the card; `contain` letterboxes posters, flyers, and wide product shots so nothing is cut off.
- Body blocks, in reading order:
  - `{ "type": "paragraph", "content": [...] }`: runs of plain strings, or `{ "text", "strong": true }` for bold, or `{ "text", "href" }` for a link (https, mailto:, tel:, or a site path such as `/products/<slug>` or `/#visit`). `"\n"` inside text breaks the line.
  - `{ "type": "heading", "text" }`, `{ "type": "quote", "text" }`.
  - `{ "type": "list", "items": [[...runs], [...runs]] }`: one array of runs per bullet.
  - `{ "type": "image", "image": { "src", "width", "height", "alt" }, "caption"? }`: `src` is the photo's media path.
- Newly attached photos have `uploads/` paths; saving moves them into `news/` and returns the saved paths, so use those in later edits.

Steps:

1. For an edit, find the post with `list_news`, then `get_news_post` for its full record. For a new post, check with `list_news` that the slug is free.
2. Write the post from the owner's words. Keep their wording and facts; fix only typos and obvious formatting. Link products the shop carries to `/products/<slug>` when they exist (check `list_catalog`).
3. Ask whether to publish now, schedule it, or keep a draft, unless the owner said.
4. Call `save_news_post` with the complete post (with `id` when editing). The owner previews the card and the article and approves.
5. To delete, call `delete_news_post` with the id and title. Saving as a draft hides a post without deleting it.
