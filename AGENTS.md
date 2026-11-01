<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Working agreement

Read `AGENTS.md` and `README.md` before starting work. Keep product details in the README rather than duplicating them here.

- Inspect and safeguard existing uncommitted work; never reset or overwrite unrelated changes. Avoid concurrent writers to the same files.
- Maintain monochrome design (the only color is the faint green sent tint on the footer Send Message button; the visit section’s tinted glass is an intentional status cue: soft yellow for schedule changes, green for open, red for closed; photos are grayscale except the active item in a gallery, such as the brand wall or repair carousel, and shop product photos, which stay in color because the finish matters; the Used Equipment page’s service-bench photo also stays in color; the product details’ visual-condition badges are status cues: green for New, blue for Demo, amber for Used; the loader’s liquid glass keeps its chromatic edge streaks; the contact footer’s Kimber-style cable divider is copper), minimal user-facing copy, accessible semantics, keyboard interaction, and reduced-motion support. Preserve established animation and component behavior unless the task asks otherwise. Do not add motion/sound control buttons, a category selection arrow, or gratuitous copy.
- Follow the installed Next.js documentation rule above and use proportionate validation. Keep `pnpm lint` and `pnpm typecheck` error-free.
- Next.js conventions: Server Components by default, with `"use client"` only on interactive pieces. Cache Components and Partial Prefetching are on:
  - **Data:** Server Components read data directly through `server-only` modules (`lib/*-data.ts`) as `"use cache"` functions with `cacheLife("content")` and a `cacheTag`. There are no route segment `revalidate`/`dynamic` exports.
  - **URL data:** read `params`, `searchParams`, and `usePathname()` inside `<Suspense>`.
  - **Session data:** read the signed-in user only through `sessionSupabase()` inside `<Suspense>`; it awaits `connection()`, because Supabase reads the clock and that can't run while Next prerenders or prefetches.
  - **Hidden pages:** visited pages stay mounted but hidden (`<Activity>`), so client effects must clean up, avoid document-wide queries that could match a hidden page, and ignore zero-size measurements.
  - **Route Handlers:** they only serve Client Components, plus `/auth/confirm`, which turns Supabase email links into a session.
  - **Mutations:** these include admin forms. They are Server Actions that verify the signed-in admin inside every action (Proxy is only an optimistic redirect), validate input on the server, and write through the user’s Supabase session so RLS applies (never the secret key). Afterward they call `updateTag(<tag>)` (from a Route Handler, `revalidateTag(<tag>, "max")`). The admin agent is the exception: see below.
  - **Images:** use `loading="eager"` or `preload`, never the deprecated `priority`.
  - **CSP:** keep the `next.config.ts` Content-Security-Policy current when adding an external origin. A nonce-based CSP belongs only on dynamically rendered routes such as `/admin`, set in `proxy.ts`.
  - **Checking:** check new routes in `next dev` for Cache Components insights (dev overlay, console, or `get_errors` at `/_next/mcp`).
- Database changes go through SQL migrations in `supabase/migrations`, saved as `<applied version>_<name>.sql` with exactly the SQL that was applied. Give every table, view, or function the Data API can reach an explicit grant and RLS; check access as each role and run the Supabase advisors after schema changes. Shop categories, brands, and products live only in Supabase, read through `lib/catalog-data.ts`; don't add code copies, and run `scripts/verify-catalog-access.sql` after catalog schema or policy changes. Keep secret keys out of `NEXT_PUBLIC_` variables, commits, and chat.
- The admin agent in `agent/` is an eve project (pinned release candidate) that Next.js hosts through `withEve`. Read the bundled docs in `node_modules/eve/docs/` before changing it.
  - **Supabase access:** agent code reaches Supabase only as the signed-in admin, through `callerSupabase(ctx)`, so RLS applies. Never use the secret key or the Supabase management MCP connector there. Agent code can't import `server-only` modules; share pure code from `lib/` (the agent's imports are relative).
  - **Write tools:** every write tool sets `approval` (`always()` with a prompt) and takes a Zod schema from `lib/admin/schemas.ts`. Add each one to `SAVE_TOOLS` with a preview drawn from the site's own components in `components/admin/change-preview.tsx`; make links in listings and cards `inert`. Return the cache tags it changes as `revalidate`, and allow them in `refreshSiteContent`. Tools exchange dates as store-time `YYYY-MM-DDTHH:MM` (`lib/admin/store-time.ts`). Pasted photos stage in `media/uploads/`, and a save copies the ones it uses into its section's folder with `placeUploads`.
  - **Knowledge and models:** put domain rules in `agent/skills/`, and use subagents only for bounded work that doesn't need the conversation. Models come from OpenRouter in `agent/lib/models.ts`.

## Documentation is part of completion

At every meaningful code change, review and update important project information and features. Update `README.md` for changed features, architecture/routes, dependencies/setup, asset sources, and known limitations. Update `AGENTS.md` when durable development conventions or workflow change. Keep both useful and concise. Include a brief note in the final response describing documentation updates or why no update was needed.

## User-designated control chat

The original chat designated by the user is the control/orchestration room. For each new implementation task requested there, create a separate local project chat with scope, context, acceptance criteria, and documentation requirements. Monitor progress, review results, and report back to the user. Sequence tasks touching the same files to avoid concurrent writers.

Use lower reasoning for routine bounded tasks and higher reasoning only when complexity warrants it. Omit the `create_thread` model override and use the configured default unless the user requests a specific model. A user wanting a particular cheaper model can specify it or configure the default; do not invent prices or promise savings.

Implementation chats execute their assigned work without recursively creating chats. This workflow applies to the user-designated control chat and its dispatched work; it does not impose global spawning rules on arbitrary implementation chats.
