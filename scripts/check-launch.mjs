import assert from "node:assert/strict"
import { parseArgs } from "node:util"

// Read-only checks against local, demo, or (after approval) the final website.
// No credentials, cookies, database writes, publishing, or DNS changes.
const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:3000" },
    mode: { type: "string", default: "demo" },
    crawl: { type: "boolean", default: false },
    legacy: { type: "boolean", default: false },
    "strict-legacy": { type: "boolean", default: false },
  },
})
const base = new URL(values.url)
const production = "https://www.qaudio.com"
assert(
  ["http:", "https:"].includes(base.protocol) &&
    !base.username &&
    !base.password,
  "Use an HTTP(S) origin without credentials"
)
assert(
  ["demo", "production"].includes(values.mode),
  "--mode must be demo or production"
)
assert(
  values.mode !== "production" || base.origin === production,
  "Production checks target https://www.qaudio.com"
)
const failures = []
const decode = (value) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
const check = (condition, message) => {
  if (!condition) failures.push(message)
}
const attrs = (tag) =>
  Object.fromEntries(
    [...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => [
      key,
      decode(value),
    ])
  )

function metadata(body) {
  const tags = [...body.matchAll(/<(?:meta|link)\b[^>]*>/g)].map(([tag]) =>
    attrs(tag)
  )
  return {
    canonical: tags.find((tag) => tag.rel === "canonical")?.href,
    robots: tags.find((tag) => tag.name === "robots")?.content ?? "",
    description: tags.find((tag) => tag.name === "description")?.content,
    image: tags.find((tag) => tag.property === "og:image")?.content,
    title: body.match(/<title>(.*?)<\/title>/s)?.[1],
  }
}

function schemas(body) {
  return [
    ...body.matchAll(
      /<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/gs
    ),
  ].flatMap(([, text]) => {
    try {
      const value = JSON.parse(text)
      return value["@graph"] ?? [value]
    } catch {
      failures.push("Invalid structured-data JSON")
      return []
    }
  })
}

async function get(path, origin = base.origin) {
  const url = new URL(path, origin)
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(30000),
    headers: { "User-Agent": "QAudioLaunchCheck/1.0" },
  })
  return { response, body: await response.text(), url }
}

function indexing(response, path, internal = false) {
  const excluded = /noindex/i.test(response.headers.get("x-robots-tag") ?? "")
  check(
    excluded === (values.mode === "demo" || internal),
    `${path}: unexpected indexing header`
  )
}

async function publicPage(path) {
  const { response, body } = await get(path)
  check(response.status === 200, `${path}: HTTP ${response.status}`)
  indexing(response, path)
  const meta = metadata(body)
  check(
    meta.canonical &&
      new URL(meta.canonical).href === new URL(path, production).href,
    `${path}: wrong or missing canonical (${meta.canonical ?? "none"})`
  )
  check(
    !/noindex/i.test(meta.robots),
    `${path}: public page has noindex metadata`
  )
  check(
    Boolean(meta.title && meta.description && meta.image),
    `${path}: incomplete title, description, or sharing image`
  )
  return { body, meta, data: schemas(body) }
}

const sitemap = await get("/sitemap.xml")
check(sitemap.response.status === 200, "sitemap.xml: must return 200")
indexing(sitemap.response, "/sitemap.xml")
const urls = [...sitemap.body.matchAll(/<loc>(.*?)<\/loc>/g)].map(([, url]) =>
  decode(url)
)
check(urls.length > 7, "sitemap.xml: published content is missing")
check(new Set(urls).size === urls.length, "sitemap.xml: duplicate URLs")
for (const url of urls) {
  const parsed = new URL(url)
  check(
    parsed.origin === production,
    `sitemap.xml: unexpected origin ${parsed.origin}`
  )
  check(
    !/^\/(admin|api|auth|eve)(\/|$)/.test(parsed.pathname),
    `sitemap.xml: internal URL ${url}`
  )
  check(
    !["/used", "/search", "/mail-order-policies"].includes(parsed.pathname),
    `sitemap.xml: redirect URL ${url}`
  )
}
const robots = await get("/robots.txt")
check(robots.response.status === 200, "robots.txt: must return 200")
check(
  robots.body.includes(`Sitemap: ${production}/sitemap.xml`),
  "robots.txt: wrong sitemap URL"
)
check(
  !/^Disallow:\s*\/$/m.test(robots.body),
  "robots.txt: crawlers must be able to read noindex headers"
)

const staticPaths = [
  "/",
  "/shop",
  "/news",
  "/news/archive",
  "/sales",
  "/qdeal",
  "/in-store-policies",
  "/how-to-order",
]
const samplePaths = [...staticPaths]
for (const prefix of ["/products/", "/news/", "/shop/", "/shop?brand="]) {
  const found = urls.find(
    (url) =>
      url.replace(production, "").startsWith(prefix) &&
      !url.includes("/news/archive")
  )
  if (found) samplePaths.push(found.replace(production, ""))
}
const paths = values.crawl
  ? urls.map((url) => url.replace(production, ""))
  : [...new Set(samplePaths)]
for (let i = 0; i < paths.length; i += 4) {
  await Promise.all(
    paths.slice(i, i + 4).map(async (path) => {
      try {
        const { body, data } = await publicPage(path)
        if (path === "/") {
          check(
            data.some((item) => item["@type"] === "ElectronicsStore"),
            "Home: local-business data missing"
          )
          const html = body.replace(/<script\b[^>]*>.*?<\/script>/gs, "")
          check(
            /<p>\s*Yes, we do repairs\./.test(html),
            "Home: repair FAQ answer missing from initial HTML"
          )
        }
        if (path.startsWith("/products/"))
          check(
            data.some((item) => item["@type"] === "Product"),
            `${path}: product data missing`
          )
        if (path.startsWith("/news/") && !path.startsWith("/news/archive"))
          check(
            data.some((item) => item["@type"] === "Article"),
            `${path}: article data missing`
          )
        if (path === "/news")
          check(
            /href="\/news\/archive"/.test(body),
            "News: missing archive link"
          )
        if (path === "/news/archive")
          check(
            /href="\/news\/(?!archive)[^"]+"/.test(body),
            "Archive: no crawlable article links"
          )
      } catch (error) {
        failures.push(`${path}: ${error.name}`)
      }
    })
  )
  if (i % 40 === 0)
    console.log(
      `Checked public pages ${Math.min(i + 4, paths.length)}/${paths.length}`
    )
}

const login = await get("/admin/login")
check(
  login.response.status === 200 && /noindex/i.test(metadata(login.body).robots),
  "Admin login must be noindex"
)
indexing(login.response, "/admin/login", true)
const admin = await get("/admin")
check(
  [307, 308].includes(admin.response.status) &&
    new URL(admin.response.headers.get("location"), base).pathname ===
      "/admin/login",
  "Signed-out admin must redirect to login"
)
indexing(admin.response, "/admin", true)
for (const path of ["/api/admin/news", "/api/admin/media"]) {
  const { response } = await get(path)
  check(response.status === 401, `${path}: must reject signed-out visitors`)
  indexing(response, path, true)
}
for (const path of [
  "/launch-check-missing",
  "/products/launch-check-missing",
  "/news/launch-check-missing",
  "/shop/launch-check-missing",
  "/news/archive?page=0",
]) {
  const { response, body } = await get(path)
  check(
    [200, 404].includes(response.status) &&
      /noindex/i.test(metadata(body).robots),
    `${path}: missing content must be excluded from indexing`
  )
}
for (const [path, target] of [
  ["/used", "/shop/used-equipment"],
  ["/search", "/shop"],
  ["/mail-order-policies", "/in-store-policies#shipping"],
  ["/categories/subwoofer", "/shop/subwoofers"],
  ["/brands/musical-fideliy", "/shop?brand=musical-fidelity"],
]) {
  const { response } = await get(path)
  check(
    [301, 308].includes(response.status) &&
      new URL(response.headers.get("location"), base).href ===
        new URL(target, base).href,
    `${path}: wrong migration redirect`
  )
}
const image = await fetch(new URL("/opengraph-image", base), {
  signal: AbortSignal.timeout(30000),
})
check(
  image.status === 200 &&
    image.headers.get("content-type")?.includes("image/png"),
  "Default sharing image must return a PNG"
)
const png = Buffer.from(await image.arrayBuffer())
check(
  png.length > 24 &&
    png.readUInt32BE(16) === 1200 &&
    png.readUInt32BE(20) === 630,
  "Default sharing image must be 1200 × 630"
)

if (values.legacy || values["strict-legacy"]) {
  const old = await get("/sitemap.xml", production)
  const legacyUrls = [...old.body.matchAll(/<loc>(.*?)<\/loc>/g)].map(
    ([, url]) => decode(url)
  )
  check(
    old.response.status === 200 && legacyUrls.length > 0,
    "Could not read the live legacy sitemap"
  )
  const missing = []
  let redirected = 0
  for (let i = 0; i < legacyUrls.length; i += 4) {
    await Promise.all(
      legacyUrls.slice(i, i + 4).map(async (oldUrl) => {
        const parsed = new URL(oldUrl)
        let path = parsed.pathname + parsed.search
        try {
          for (let hop = 0; hop < 5; hop++) {
            const { response, body } = await get(path)
            const location = response.headers.get("location")
            if (location && response.status >= 300 && response.status < 400) {
              const next = new URL(location, base)
              if (next.origin !== base.origin)
                throw new Error("Cross-origin redirect")
              path = next.pathname + next.search
              if (hop === 0) redirected++
              continue
            }
            if (
              [404, 410].includes(response.status) ||
              (response.status === 200 &&
                /noindex/i.test(metadata(body).robots))
            )
              missing.push(parsed.pathname)
            else
              check(
                response.status === 200,
                `${parsed.pathname}: legacy destination returned HTTP ${response.status}`
              )
            return
          }
          failures.push(`${parsed.pathname}: legacy redirect loop`)
        } catch {
          failures.push(`${parsed.pathname}: legacy request failed`)
        }
      })
    )
    if (i % 40 === 0)
      console.log(
        `Checked legacy URLs ${Math.min(i + 4, legacyUrls.length)}/${legacyUrls.length}`
      )
  }
  console.log(
    JSON.stringify(
      { legacyUrls: legacyUrls.length, redirected, retiredCandidates: missing },
      null,
      2
    )
  )
  if (values["strict-legacy"])
    check(
      missing.length === 0,
      `${missing.length} legacy URLs are absent from the published selection`
    )
}

console.log(
  JSON.stringify(
    {
      origin: base.origin,
      mode: values.mode,
      sitemapUrls: urls.length,
      checkedPublicPages: paths.length,
      failures,
    },
    null,
    2
  )
)
if (failures.length) process.exitCode = 1
