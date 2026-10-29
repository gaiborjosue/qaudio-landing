# Q Audio

A monochrome hi-fi storefront prototype for Q Audio in Cambridge, Massachusetts. The landing experience, category exploration, brand destinations, and contact dialog are implemented. Shop destinations are collection placeholders; product inventory, checkout, backend, and contact form submission are not implemented.

## Setup and commands

Run `pnpm install`, then `pnpm dev` and open [localhost:3000](http://localhost:3000). A pnpm lockfile is included. `package.json` does not pin a Node engine or package-manager version. The current app requires no application environment variables. Epilogue and Bodoni Moda load through `next/font/google`.

Declared versions include Next.js **16.4.2**, React/React DOM **19.3.1**, TypeScript **^5**, Tailwind CSS **^4**, GSAP **^3.15.0**, `@gsap/react` **^2.1.2**, Motion **^14.7.1**, and shadcn **^4.22.1**. See [package.json](package.json) for all dependencies and version ranges.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Start development server |
| `pnpm build` | Build production app |
| `pnpm start` | Serve production build |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | Run TypeScript without emitting files |
| `pnpm format` | Format all TS/TSX files with Prettier; writes files |

## Experience and routes

- `/`: logo/contact header, dithered hero, pinned listening story, category explorer at `#categories`, and brand wall at `#product-lines`.
- `/shop/[category]`: artwork, category title, contact action, and return link to the explorer. The 14 slugs in [lib/categories.ts](lib/categories.ts) provide static params; unknown categories return not found.
- `/shop`: collection placeholder. `/shop?brand=<slug>` selects a logo and removable brand filter from the 23 entries in [lib/brands.ts](lib/brands.ts). Clearing the filter returns to `/shop`; unknown brand values return not found. Filtered pages retain a visually hidden accessible heading to avoid a duplicate visible title.

The GSAP/ScrollTrigger story pins the stage while the hero exits and vinyl travels through opening text rows. The record tilts, grows, lands on the turntable, and the tonearm moves into place before the story text fades. Responsive layouts, reduced-motion fallbacks, and section-anchor restoration after pinned layout setup are implemented.

The React Bits OptionWheel loops through 14 categories, initially Turntables. Mouse wheel, pointer drag, clicks, arrow keys, and Home/End change selection. Selection updates product artwork, grayscale photo atmosphere, title, and counter. The local `/sounds/option-tick.mp3` plays at volume `0.45`, throttled to 70 ms; browser playback failures are ignored. There is no selection arrow or separate sound/motion control.

The category Shop link uses the local LiquidGlass component for the Aceternity-style treatment: `radius=31`, `scale=120`, `aberration=56`, `bevelDepth=60`, `frost=0`, `tint=0`, plus a mouse-position highlight. SVG backdrop refraction targets Chromium. Reduced-transparency preferences select an opaque background with no backdrop filter. Safari-like user agents or a failed CSS URL backdrop-filter support check select the simple blur/saturation fallback (blur follows `frost`, currently `0`). There is no explicit Firefox detection; its fallback depends on those checks.

The React Bits DriftWall shows responsive brand columns with grayscale enabled, `pauseOnHover`, black overlay, and `dim=0.8`. Drifting pauses on hover or keyboard focus. Reduced motion presents a static grid containing every brand. The plane ignores pointer events while tiles accept them, allowing one-click navigation. Destination logos use grayscale/invert/contrast and multiply blending on white to remove black boxes.

"Get in touch" opens a native modal dialog with `info@qaudio.com`, `(617) 547-2727`, and 5 Brookline Street, Cambridge, MA 02139. It closes through the close button, backdrop click, or native Escape behavior. Email and phone actions use `mailto:` and `tel:` links.

## Source map and typography

| Location | Responsibility |
| --- | --- |
| [app/layout.tsx](app/layout.tsx) | Metadata and font variables |
| [app/page.tsx](app/page.tsx) | Landing composition |
| [app/globals.css](app/globals.css) | Monochrome styling, responsive layouts, accessibility fallbacks |
| [app/shop/page.tsx](app/shop/page.tsx), [category page](app/shop/[category]/page.tsx) | Collection/brand and category destinations |
| [components/scroll-experience.tsx](components/scroll-experience.tsx) | GSAP story and anchor restoration |
| [components/vinyl-record.tsx](components/vinyl-record.tsx), [components/record-player.tsx](components/record-player.tsx), [components/dither-background.tsx](components/dither-background.tsx) | Hero/story visuals |
| [components/category-section.tsx](components/category-section.tsx), [components/OptionWheel.jsx](components/OptionWheel.jsx) and its CSS | Category exploration |
| [components/product-lines-section.tsx](components/product-lines-section.tsx), [components/DriftWall.jsx](components/DriftWall.jsx) and its CSS | Brand wall |
| [components/ui/liquid-glass.tsx](components/ui/liquid-glass.tsx) | Glass surface and fallback |
| [components/contact-button.tsx](components/contact-button.tsx) | Contact dialog |
| [lib/categories.ts](lib/categories.ts), [lib/brands.ts](lib/brands.ts) | Data, assets, destination links |

The current font trial uses Epilogue throughout live typography, including the option wheel, form controls, and authored turntable SVG labels. Supplied logo artwork stays unchanged. Hero, section, contact, and destination titles use weight 500; the large scrolling story stays at 400; wheel labels use 200 resting and 500 selected. Hero tracking is −0.055em. To return to the Inter trial, replace the Epilogue import, font initializer, and variable reference in `app/layout.tsx` with Inter; the shared `--font-ui` variable keeps all typography in sync. `--font-display: var(--font-ui)` in `app/globals.css` controls display families. Bodoni Moda remains loaded as `--font-editorial`: switch `--font-display` to `var(--font-editorial)` for an editorial comparison, and reset the five title weights to 400 and hero tracking to −0.065em for the earlier display treatment. Body, controls, wheel, and SVG labels remain Epilogue.

## Assets and attribution

- `public/categories/` and `public/brands/` hold supplied artwork/logos, originally from `/Users/edwardgaibor/Developer/q-audio-prototypes/public/categories` and that prototype's `public/featuredLines`, respectively.
- `public/category-scenes/` holds local category photos. [sources.json](public/category-scenes/sources.json) records Q Audio page URLs, original CDN URLs, filenames, and byte counts.
- `public/qaudio-logo.svg` is the site logo; `public/sounds/option-tick.mp3` is the selection tick.
- OptionWheel and DriftWall identify their React Bits origins in source. Retain [components/react-bits.LICENSE.md](components/react-bits.LICENSE.md), including the MIT + Commons Clause terms covering components, tools, and sounds.

## Development and verification

Read [AGENTS.md](AGENTS.md) before work, including its requirement to read relevant installed Next.js guides in `node_modules/next/dist/docs/` before writing code. Preserve uncommitted work, minimal copy, accessible headings, keyboard/focus behavior, reduced motion, and established animation behavior.

Keep this README current when features, architecture/routes, setup/dependencies, asset sources, or limitations change. Update AGENTS when durable workflow conventions change. Documentation is part of task completion.

Use proportionate checks: lint/typecheck for code changes, and a production build when routing or build behavior is affected. For interaction changes, inspect relevant desktop/mobile layouts, forward/reverse scrolling, return anchors, wheel inputs/sound, category/brand destinations, one-click brand navigation, modal behavior, keyboard focus, and reduced motion. Check browser glass fallback when changing that effect. No test script is currently defined. Documentation-only edits need source/link verification and diff review without a build.

Brand filtering currently changes destination branding rather than filtering a product catalog. Browser audio policies can suppress the tick, and glass rendering varies across browsers. Source inspection alone does not certify cross-browser visual behavior.
