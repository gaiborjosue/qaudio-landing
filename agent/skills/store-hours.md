---
description: Use before changing the regular weekly hours or adding, editing, or removing a schedule change (special hours, holiday closures).
---

Load these instructions with `eve__skill({ name: "store-hours" })`. Discover this group with `eve__search({ query: "hours__" })` unless its signatures are already in context. Execute the discovered tools with `eve__tool({ name, input })`, using their exact names and signatures. Read current data before writing; reuse discovery while its signatures remain in context. For requests spanning domains, also load the other skill and discover its group as needed.

How the site's hours work:

- The regular week has exactly seven days, Monday first. Each day is `open` (with `opens_at` before `closes_at`, 24-hour `HH:MM`), `appointment` (by appointment only), or `closed`. Only open days carry times.
- A schedule change overrides the regular week from `starts_on` through `ends_on` (inclusive; the same date for a single day). It has the same three kinds, and an optional short `note` such as "Thanksgiving" (200 characters at most).
- The site shows upcoming changes in a "Schedule changes" notice for the 60 days before they start, and drops them automatically after their last date. The visit section and the hero's today pill switch to the change on those dates.
- Don't let changes overlap: only the first matching change applies. Edit the existing change (by its `id`) or remove it instead.

Steps:

1. Call `hours__get_store_hours` for the current week, today's store date, and the existing changes with their ids.
2. Resolve relative dates ("next Friday", "Thanksgiving week") against today's store date, and say the exact dates back when you propose.
3. For the regular week, call `hours__set_weekly_hours` with all seven days, unchanged days included.
4. For a dated change, call `hours__save_hours_change` (with `id` to edit one). To remove one, call `hours__delete_hours_change` with its `id` and a short summary such as "Closed Nov 7–15".
5. "Closed on Monday" usually means one date (a schedule change), not the regular week. Ask if it's unclear.
