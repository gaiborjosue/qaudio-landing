![Q Audio banner](docs/assets/qaudio-banner.png)

# Q Audio

Landing page, product catalog, and custom owner dashboard for Q Audio, a hi-fi shop in Cambridge, Massachusetts. Built with Next.js, React, Supabase, and Eve.

## Application

- **Public site:** shop information, equipment, brands, services, news, QDeals, and store hours.
- **Owner dashboard (`/admin`):** direct editors for products, news, categories, and brands.
- **Tune:** an Eve agent for managing hours, news, deals, product sales, Instagram, and Google Business through chat. Proposed changes include previews and require owner approval before saving or publishing.

## Integrations

| Service | Purpose |
| --- | --- |
| Supabase | Database, admin authentication, and media storage |
| OpenRouter | Agent models, routing, and Instagram story image generation |
| Zernio | Instagram publishing, Google Business hours/posts, and managed OAuth |
| Tavily | Manufacturer page lookup and product form prefill |
| Groq | Voice message transcription |
| Supermemory | Owner preferences across conversations |

Tune's tools and skills live in [agent/](agent/); model routing is configured in [agent/lib/models.ts](agent/lib/models.ts).

## Development

Use **Node.js 24.x** and **pnpm**. Copy [.env.example](.env.example) to `.env.local`, configure Supabase and OpenRouter, and add credentials for the integrations you use.

```sh
pnpm install
pnpm dev
```

Open [localhost:3000](http://localhost:3000). The dashboard requires an authorized Supabase admin account.

```sh
pnpm lint
pnpm typecheck
pnpm test:chat
```

Additional feature tests are listed in [package.json](package.json).

## Deployment

Vercel builds the website and Eve as separate services in one project using `pnpm build`. Vercel Workflow stores and resumes Tune's agent runs, including waits for owner approval.

See the [launch runbook](docs/launch.md) for local production checks, environment and authentication setup, demo review, and the approved domain switch.
