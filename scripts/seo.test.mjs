import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server.js"

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "eve/next")
      return {
        url: "data:text/javascript,export const withEve = config => config",
        shortCircuit: true,
      }
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const url = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://seo-test.supabase.co"
const { default: nextConfig } = await import("../next.config.ts")
const { indexingHeaders } = await import("../lib/indexing.ts")
const {
  pageMetadata,
  jsonLd,
  productStructuredData,
  returnPolicyStructuredData,
  storeStructuredData,
  articleStructuredData,
  productDescription,
} = await import("../lib/seo.ts")
const { sellingPrice } = await import("../lib/catalog.ts")
const { newsArchivePage, newsArchiveHref } = await import("../lib/news.ts")

const response = (url, config = nextConfig) =>
  unstable_getResponseFromNextConfig({ url, nextConfig: config })

test("only the final public hostname is indexable; demo and internal URLs stay excluded", async () => {
  for (const host of [
    "demo.qaudio.com",
    "qaudio-git-main.vercel.app",
    "localhost:3000",
    "www.qaudio.com.attacker.test",
  ]) {
    const result = await response(`https://${host}/shop`)
    assert.match(result.headers.get("x-robots-tag"), /noindex/, host)
    assert.equal(result.headers.get("location"), null, host)
  }
  assert.equal(
    (await response("https://www.qaudio.com/shop")).headers.get("x-robots-tag"),
    null
  )
  for (const path of [
    "/admin",
    "/admin/login",
    "/admin/products",
    "/api/admin/media",
    "/auth/confirm",
    "/eve/v1/sessions",
    "/_eve_internal/eve/v1/sessions",
  ]) {
    assert.match(
      (await response(`https://www.qaudio.com${path}`)).headers.get(
        "x-robots-tag"
      ),
      /noindex/,
      path
    )
  }
  assert.match(
    (
      await response("https://www.qaudio.com/", {
        headers: async () => indexingHeaders(true),
      })
    ).headers.get("x-robots-tag"),
    /noindex/
  )
})

test("launch redirects retain the request path and query while demo stays browsable", async () => {
  const apex = await response("https://qaudio.com/products/turntable?ref=mail")
  assert.equal(apex.status, 308)
  assert.equal(
    apex.headers.get("location"),
    "https://www.qaudio.com/products/turntable?ref=mail"
  )
  for (const [source, target] of [
    ["/search", "/shop"],
    ["/mail-order-policies", "/in-store-policies#shipping"],
  ]) {
    const result = await response(`https://demo.qaudio.com${source}`)
    assert.equal(result.status, 308)
    assert.equal(
      result.headers.get("location"),
      `https://demo.qaudio.com${target}`
    )
  }
})

test("metadata stays on the final domain and structured JSON cannot end a script", () => {
  const metadata = pageMetadata({
    title: "A turntable",
    description: "Details",
    path: "/products/a-turntable",
  })
  assert.equal(
    metadata.alternates.canonical,
    "https://www.qaudio.com/products/a-turntable"
  )
  assert.equal(metadata.openGraph.url, metadata.alternates.canonical)
  assert.equal(metadata.twitter.card, "summary_large_image")
  assert.equal(
    metadata.openGraph.images[0].url,
    "https://www.qaudio.com/opengraph-image"
  )
  const value = { name: '</script><script>alert("test")</script>' }
  assert(!jsonLd(value).includes("<"))
  assert.deepEqual(JSON.parse(jsonLd(value)), value)
})

test("product offers follow the same live sale price and never advertise sold/unpriced equipment", () => {
  const now = Date.parse("2026-11-08T12:00:00Z")
  const price = sellingPrice(
    {
      price_cents: 100000,
      sale_price_cents: 80000,
      sale_starts_at: null,
      sale_ends_at: "2026-11-09T04:59:00Z",
    },
    now
  )
  const product = {
    slug: "turntable",
    name: "Turntable",
    short_description: "Hi-fi",
    images: [],
    category: { name: "Turntables" },
    brand: null,
    condition: "New",
    availability: "available",
    ...price,
  }
  const schema = productStructuredData(product)
  assert.equal(schema.offers.price, "800.00")
  assert.equal(schema.offers.priceValidUntil, "2026-11-08")
  assert.equal(schema.offers.url, "https://www.qaudio.com/products/turntable")
  assert.equal(schema.offers.availability, "https://schema.org/InStoreOnly")
  assert.equal(Object.hasOwn(schema.offers, "shippingDetails"), false)
  const policy = returnPolicyStructuredData()
  assert.equal(schema.offers.seller["@id"], policy["@id"])
  assert.deepEqual(schema.offers.hasMerchantReturnPolicy, {
    "@id": "https://www.qaudio.com/in-store-policies#return-policy",
  })
  assert.deepEqual(policy.hasMerchantReturnPolicy, {
    "@type": "MerchantReturnPolicy",
    "@id": schema.offers.hasMerchantReturnPolicy["@id"],
    merchantReturnLink: "https://www.qaudio.com/in-store-policies",
  })
  for (const change of [
    { availability: "sold" },
    { availability: "unavailable" },
    { price_cents: null },
  ]) {
    assert.equal(
      productStructuredData({ ...product, ...change }).offers,
      undefined
    )
  }
})

test("store schema preserves appointment-only days and exact special-date ranges", () => {
  const store = storeStructuredData({
    weekly: ["appointment", "closed", { open: "10:00", close: "17:00" }],
    changes: [
      { start: "2026-11-10", end: "2026-11-12", hours: "closed" },
      { start: "2026-11-13", hours: "appointment" },
    ],
  })["@graph"][1]
  assert.equal(store.openingHoursSpecification.length, 2)
  assert(
    !store.openingHoursSpecification.some((day) =>
      day.dayOfWeek.endsWith("Monday")
    )
  )
  assert.equal(store.specialOpeningHoursSpecification.length, 1)
  assert.deepEqual(store.specialOpeningHoursSpecification[0], {
    "@type": "OpeningHoursSpecification",
    validFrom: "2026-11-10",
    validThrough: "2026-11-12",
    opens: "00:00",
    closes: "00:00",
  })
})

test("archive pages are bounded and normalize their canonical URLs", () => {
  assert.equal(newsArchivePage(undefined, 0), 1)
  assert.equal(newsArchivePage("2", 25), 2)
  for (const value of ["0", "-1", "01", "1.5", "1000000", ["1", "2"], "3"])
    assert.equal(newsArchivePage(value, 25), null)
  assert.equal(newsArchiveHref(1), "/news/archive")
  assert.equal(newsArchiveHref(2), "/news/archive?page=2")
})

test("article schema uses the original publication and modification timestamps", () => {
  const schema = articleStructuredData({
    slug: "listening",
    title: "Listening",
    excerpt: "News",
    cover: { src: "https://example.com/cover.jpg" },
    publishedAt: "2026-11-07T17:00:00Z",
    modifiedAt: "2026-11-08T18:00:00Z",
  })
  assert.equal(schema.datePublished, "2026-11-07T17:00:00Z")
  assert.equal(schema.dateModified, "2026-11-08T18:00:00Z")
  assert.equal(schema.mainEntityOfPage, "https://www.qaudio.com/news/listening")
})

test("legacy products with blank card lines still have plain, bounded metadata", () => {
  const product = {
    name: "Turntable",
    short_description: "",
    description:
      "# Overview\nA **carefully built** [turntable](https://example.com).",
  }
  assert.equal(
    productDescription(product),
    "Overview A carefully built turntable."
  )
  assert(
    productDescription({ ...product, description: "" }).includes(
      "Turntable at Q Audio"
    )
  )
  assert(
    productDescription({
      ...product,
      description: "Long description. ".repeat(40),
    }).length <= 181
  )
})
