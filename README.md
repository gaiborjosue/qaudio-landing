# Q Audio

The Q Audio storefront and admin workspace for Cambridge, Massachusetts, built with Next.js, Supabase, and Eve.

Run `pnpm install`, configure `.env` or `.env.local` from `.env.example`, then start with `pnpm dev` (Node 24+). Exact `DEBUG_DEV_MODE=true` uses the local ChatGPT subscription for Terra and Sol; other values and production use OpenRouter. Haiku and image generation retain their existing providers and keys.

For local production verification, `pnpm build:local` builds both Eve and Next; then run `pnpm start:check --port 3100` for storefront/API smoke checks with the agent transport disabled, preserving development chat storage. Vercel keeps the normal `pnpm build` command. The [demo and production runbook](docs/launch.md) covers SEO, indexing, old URLs, account configuration, owner review, and the approved domain switch. Run `pnpm test:seo` for indexing/schema checks and `pnpm check:launch --url http://localhost:3100 --mode demo --crawl` against the running build. Full agent acceptance belongs on the hosted demo.

On Windows, dev startup discovers the newest versioned native Codex desktop CLI under `%LOCALAPPDATA%/OpenAI/Codex/bin` and puts its directory first on the dev process's PATH before Eve starts. This survives desktop updates and new terminals without a hard-coded version folder or a global PATH change. Startup prints the selected executable. If signed out, invoke that executable with `login` (PowerShell: `& '<printed path>' login`), then restart dev. An already-running Eve broker needs a full Ctrl+C / `pnpm dev` restart to pick up the new path; a browser refresh cannot replace its cached credential-store choice. When the versioned desktop CLI is absent, the existing PATH and Eve's own `/login` remain available; the legacy unversioned desktop binary is ignored because it can lack Eve's app-server protocol. Credentials stay with Codex/Eve, and authentication errors never fall back to a paid API. Run `pnpm test:dev` to check CLI discovery and its development-only guards.

The admin product editor groups Name, Address, and Availability on one row, with pricing below. These fields stack on smaller screens.

The discount icon beside Price toggles the sale fields. Sale dates appear after a sale price is entered; existing sales open expanded. Turning the toggle off clears the sale for the next Save.

Category and brand menus scroll within a 288px maximum height. Metadata product counts link to the Products tab with that category or brand selected; filters are stored in the URL, work on reload, and switching tabs preserves unsaved edits.

Sale dates use the existing shadcn range calendar in a popover with hour/minute selectors, in America/New_York store time. An empty start means Now; an end is required. The date range stays hidden until a sale price is entered.
