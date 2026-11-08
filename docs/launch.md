# Demo and production launch

The canonical website is **https://www.qaudio.com**. The owner tests the replacement on a demo hostname chosen at deployment, before the live website changes. **https://demo.qaudio.com is an example throughout this runbook**, not a requirement: a generated Vercel URL or another custom hostname works too. Substitute the actual demo origin in callback URLs, environment variables, and verification commands. Preparing or deploying the demo does not authorize the production domain switch.

## Code and indexing

- `lib/site.ts` owns the final public origin. Canonicals, sharing URLs, structured data, and sitemap entries always use it. Do not change it to the demo hostname.
- Navigation remains relative, so the owner stays on the demo while testing.
- `lib/indexing.ts` sends `X-Robots-Tag: noindex, nofollow` on every hostname except `qaudio.com` and `www.qaudio.com`, and on all preview/development deployments. This covers a demo assigned to a production deployment too.
- Admin, authentication, API, and Eve paths remain `noindex` on production. Admin pages also carry robots metadata and require a signed-in admin. Neither a hidden link nor `robots.txt` is access control.
- `robots.txt` allows crawlers to read those indexing instructions. Do not add a blanket demo/admin disallow that prevents crawlers from seeing `noindex`.
- The sitemap contains only public, published content, including canonical category/brand listings and news archive pages. It reads anonymously through the existing cached data modules; drafts and future news remain subject to RLS. Content edits invalidate the same catalog/news tags.
- Real modification timestamps are used where available. Static pages do not claim a fresh modification on every request.

## Verify locally

Node 24 and the existing `.env.local` are required. The Node major is pinned in `package.json` so Vercel does not automatically move the app to a newer major. A local production run needs both the Eve and Next builds:

```sh
pnpm lint
pnpm typecheck
node --test scripts/*.test.mjs
pnpm build:local
pnpm start:check --port 3100
```

In a second terminal:

```sh
pnpm check:launch --url http://localhost:3100 --mode demo --crawl
pnpm check:launch --url http://localhost:3100 --mode demo --legacy
```

`check:launch` makes GET requests only. It checks sitemap URLs, canonicals, metadata, structured data, the sharing image, migration redirects, missing pages, and signed-out admin/API rejection. `--crawl` checks every sitemap entry. `--legacy` compares the current live sitemap with the replacement and reports old URLs absent from the current published selection as `retiredCandidates`. Intentionally unpublished/removed content can stay 404/410 and out of the sitemap; it does not need to be restored for SEO. Unexpected failures and redirect loops still fail the check. Add `--strict-legacy` to require every old URL to have a live destination during a content review. Never redirect all missing pages to the home page.

`start:check` runs the production frontend with Eve's external-origin mode and an unused loopback agent address. It intentionally does not start or exercise the agent, so it cannot resume or rewrite development chat history. The pinned Eve local bundle currently identifies its workflow package as `traced-node-modules@1.0.0`; starting it in the normal development directory rewrites that directory's version marker. Use the hosted demo for full agent acceptance, or a separately prepared self-hosted directory with its own state. `pnpm start` remains the normal full production server command.

Webflow snapshots, import reports, originals, assets, and manifests belong on `/Volumes/Edzio SSD/qaudioAssets`, outside Git. This checker reports to the terminal; it does not import, overwrite content, or save Webflow exports.

## Prepare the demo deployment

The existing `withEve` wrapper in `next.config.ts` deploys Next.js and Eve as separately built services in one Vercel project. Public pages and `/admin` go to Next.js; `/eve/v1/*` goes to the authenticated agent service on the same origin. Each project release includes both services, and Vercel Workflow stores/resumes agent runs. Supabase and OpenRouter remain their existing external services.

1. Confirm the Vercel account/team and project for this repository. Keep the existing Next.js/Eve hosting integration; use Vercel's normal Next build command (`pnpm build`). `pnpm build:local` is for local/self-hosted production verification.
2. Configure the existing required environment variables for both the Next frontend and the Eve service. See `.env.example`; never upload `.env.local` as a source file. In particular:
   - Supabase URL and publishable key for public reads and signed-in sessions.
   - OpenRouter key for Jev, generation, and story images. AI Gateway credentials are unnecessary.
   - Zernio API key/profile for configured connections. Groq, Tavily, and Supermemory are needed only for their respective features.
   - `DEBUG_DEV_MODE=false` on hosted environments.
   - `SITE_ORIGIN=https://demo.qaudio.com` for agent-to-Next cache callbacks. This environment variable is separate from the canonical constant in `lib/site.ts`.
   - `ADMIN_CHAT_ENVIRONMENT=demo` on both Next and Eve, so the demo has its own current-chat pointer.
   - `ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED=false` until live Google writes are specifically intended and approved.
3. Preserve Supabase's existing authentication settings. Add the demo password-reset/invite callback URL to the redirect allowlist, alongside the final production callback. The generated reset target is `https://demo.qaudio.com/auth/confirm?next=/admin/set-password`; production uses the same path on `https://www.qaudio.com`. Test the existing PKCE/token-hash email templates and recovery flow before handing over the demo.
4. Use the generated Vercel hostname, or connect **only the chosen demo hostname** using the DNS target Vercel returns for that project. Preserve unrelated DNS records, especially email MX/TXT records. Confirm HTTPS before owner testing.
5. Check the actual demo response for `X-Robots-Tag: noindex, nofollow`; do not rely on Vercel's automatic preview defaults for a custom domain. Optional Deployment Protection can restrict who sees the demo; `noindex` alone does not make it private. An authenticated/protected preview may need Vercel's authenticated fetch tooling for remote checks.
6. Run the launch checks against the demo and complete the owner review below. Do not submit the demo sitemap to search engines.

The demo's Supabase edits persist in whichever database it is configured to use. Connected Instagram/Google accounts are real external services regardless of hostname. Use drafts or mocks for testing unless the owner explicitly approves a live external action; normal agent approval cards still apply.

For CLI source deployments, `.vercelignore` excludes `.env.local`, local Eve conversations/traces, dependencies, and generated build output. Upload environment values with `vercel env add` through stdin, using `secret` for provider credentials and `config` for non-secret settings. Select variables explicitly rather than copying every local variable: do not deploy import-only Supabase secret keys, local Vercel tokens, unused AI Gateway keys, or development model overrides. Environment changes require a new deployment to take effect.

### Hosted demo project

- Project: `gaiborjosues-projects/qaudio`; demo: **https://qaudio.vercel.app**.
- GitHub: `gaiborjosue/qaudio-landing`; Vercel's production branch is `master`. Other branches produce protected previews.
- Production and Preview share the selected existing provider credentials. The production demo uses `SITE_ORIGIN=https://qaudio.vercel.app` and `ADMIN_CHAT_ENVIRONMENT=demo`; previews use their automatic origin and chat namespace. Hosted development model overrides and Google Business writes are disabled.
- Existing Vercel Deployment Protection is preserved. The stable demo alias is publicly reachable with `noindex`; signed-in admin authorization still protects the dashboard, agent, and writes.
- Neither `qaudio.com` nor `www.qaudio.com` is attached. Supabase's demo recovery/invite redirect allowlist and the signed-in owner acceptance checks still need verification before handover is considered complete. Password login uses the existing admin account.

## Owner review on demo

- Verify desktop/mobile navigation, direct product links, galleries, brand/category filters, news scrolling and archive navigation, and back/forward behavior.
- Check keyboard operation, visible focus, reduced motion, and loading/error states. Run a mobile Lighthouse/PageSpeed assessment against the deployed release; local build success is not a performance score.
- Confirm store address, phone, current hours/special dates, prices, condition/availability, photos, and contact links. The contact form opens an email application; it is not a backend email sender.
- Review the restored in-store policies and ordering page, whose business terms come from the existing site. `/mail-order-policies` redirects to the shipping section because its old page contained template text.
- Verify admin login, non-admin rejection, password recovery, saved chat restoration, read tools, editor saves, and cache refreshes. Check these on the hosted Eve service as well as the frontend. Test publishing through drafts unless a real publication is intended.
- Resolve every unexpected old-URL failure from `--legacy`; retain redirects for changed URLs. Keep any owner-approved retirement decisions with the migration records on the asset drive.

## Search accounts

- Preserve the existing Search Console and Bing ownership verification. A DNS-verified domain needs no HTML token. Optional `GOOGLE_SITE_VERIFICATION` and `BING_SITE_VERIFICATION` add the providers' supplied HTML verification tokens; they are not API credentials.
- Keep the same public preferred origin (`www`) and retain relevant old paths/redirects. Replacing hosting on the same domain does not require a Search Console Change of Address request.
- Validate representative product/article/local-business markup with Google's Rich Results Test. Structured data is accurate input, not a guarantee of a special search result. Do not invent ratings, identifiers, shipping promises, or return policies for rich results.

## Production switch — after owner approval

1. Record the approved release/commit and the old website's DNS targets. Keep the old site available for rollback. Prepare the canonical `www` domain and apex redirect with valid certificates.
2. Configure `SITE_ORIGIN=https://www.qaudio.com` and a distinct production chat namespace on both services. Confirm all production credentials and the production authentication callback. Rebuild if environment configuration changes require it; verify the resulting release before routing traffic to it.
3. Attach `qaudio.com` and `www.qaudio.com` to the approved release and change only the required website DNS records. The application permanently redirects apex requests to `www`, preserving path and query. Keep the demo excluded from indexing.
4. Verify actual public responses after DNS/certificate propagation:

   ```sh
   pnpm check:launch --url https://www.qaudio.com --mode production --crawl
   ```

5. Confirm public pages have no accidental `noindex`, while admin/internal responses still do. Confirm sitemap/robots return 200, old URLs reach the right destination, and login/recovery work on the final domain.
6. Submit `https://www.qaudio.com/sitemap.xml` in the existing Search Console/Bing properties. Inspect representative URLs and monitor indexing, 404s, structured-data reports, server errors, and Core Web Vitals. Vercel runtime logs provide the initial server-error record; add an external monitoring service only with its real project credentials/configuration.
7. Keep relevant permanent redirects indefinitely where practical (at least a year for migrations). If the release fails, restore the recorded website routing and leave mail DNS records untouched.
