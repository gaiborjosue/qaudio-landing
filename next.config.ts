import type { NextConfig } from "next"
import { withEve } from "eve/next"

// News and product images are served from the Supabase media bucket.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!supabaseUrl) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL (see .env.example).")
}

// Baseline headers for every response. HTTPS (HSTS) comes from the host.
const supabaseOrigin = new URL(supabaseUrl).origin
const isDev = process.env.NODE_ENV === "development"
const devOrigins = process.env.DEV_ALLOWED_ORIGINS?.split(",")
  .map((host) => host.trim())
  .filter(Boolean)

// Content-Security-Policy without nonces: pages are prerendered (Cache
// Components' static shells), and a per-request nonce would force every page
// to render on demand. So Next's inline scripts need 'unsafe-inline', but
// scripts still load only from this origin, nothing can frame the site from
// elsewhere, and data can only go to this origin and Supabase. Dev adds
// 'unsafe-eval' for Turbopack and React's debugging.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // React style props and the liquid glass's injected SVG filters.
  "style-src 'self' 'unsafe-inline'",
  // blob: and data: carry the glass displacement maps and canvas output.
  `img-src 'self' blob: data: ${supabaseOrigin}`,
  "font-src 'self'",
  `connect-src 'self' ${supabaseOrigin}`,
  "media-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ")

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
]

const nextConfig: NextConfig = {
  // Optional hostnames for remote development, independent of social login.
  allowedDevOrigins: devOrigins?.length ? devOrigins : undefined,
  devIndicators: false,
  poweredByHeader: false,
  // Data is cached with `use cache`; pages prerender a static shell, and
  // links prefetch each route's shared App Shell.
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: {
    // Supabase content: refreshed in the background every 5 minutes, and
    // never expired, so a paused or unreachable project keeps serving the
    // last good copy. Admin saves call updateTag() to refresh immediately.
    content: { stale: 300, revalidate: 300 },
  },
  images: {
    remotePatterns: [
      new URL("/storage/v1/object/public/media/**", supabaseUrl),
    ],
  },
  headers: async () => [{ source: "/:path*", headers: securityHeaders }],
  // Keep the live qaudio.com address working; the menu links straight to the
  // Used Equipment category.
  redirects: async () => [
    { source: "/used", destination: "/shop/used-equipment", permanent: true },
  ],
}

// The admin agent in agent/ answers at /eve/v1/* on this origin: `next dev`
// starts it, and Vercel deploys it as a service of this project.
export default withEve(nextConfig)
