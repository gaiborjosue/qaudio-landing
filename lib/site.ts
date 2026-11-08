// Public identity stays on the final domain, including while testing the demo.
export const SITE_ORIGIN = "https://www.qaudio.com"
export const SITE_NAME = "Q Audio"
export const SITE_DESCRIPTION =
  "Independent hi-fi in Cambridge, Massachusetts, since 1973. Exceptional sound. A lifetime of listening."
export const STORE_ID = `${SITE_ORIGIN}/#store`
export const INSTAGRAM_URL = "https://www.instagram.com/qaudiohifi"

export const siteUrl = (path = "/") => new URL(path, SITE_ORIGIN).href

export const PUBLIC_PAGES = [
  "/",
  "/shop",
  "/news",
  "/news/archive",
  "/qdeal",
  "/in-store-policies",
  "/how-to-order",
] as const
