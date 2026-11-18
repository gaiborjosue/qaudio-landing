import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import sharp from "sharp"

// Prefill with Tune and the manufacturer link check, with Tavily, the model,
// storage, and the network replaced by fakes: address guarding, the check's
// statuses, the Tavily request, the page sent to the model, what's kept from
// the model's draft, photo staging, and the routes' refusals.

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.endsWith(".ts") &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      const candidate = fileURLToPath(
        new URL(`${specifier}.ts`, context.parentURL)
      )
      if (existsSync(candidate))
        return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})

const { guardedLookup, isPublicAddress, publicUrl } =
  await import("../lib/admin/public-fetch.ts")
const {
  checkProductPage,
  compactPage,
  importPhoto,
  prefillPrompt,
  productPageCheckRoute,
  productPagePrefillRoute,
  suggestionsFromDraft,
} = await import("../lib/admin/product-page.ts")

const origin = "https://qaudio.example"
const page = new URL("https://maker.example.com/products/orbit-theory")
const KEY = "tvly-test-only-key"
const taxonomy = {
  categories: [{ slug: "turntables", name: "Turntables" }],
  brands: [{ slug: "u-turn-audio", name: "U-Turn Audio" }],
}

function post(path, body, { site = origin } = {}) {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(site && { origin: site }),
    },
    body: JSON.stringify(body),
  })
}

const photo = (width, height) =>
  sharp({
    create: { width, height, channels: 3, background: "#c0a080" },
  })
    .png()
    .toBuffer()

const draft = (overrides = {}) => ({
  product_page: true,
  name: "U-Turn Audio Orbit Theory",
  brand_slug: "u-turn-audio",
  category_slug: "turntables",
  list_price_usd: 999,
  price_unit: "each",
  description:
    "A manual turntable.\n\n- OA3 tonearm.\n- Acrylic platter.\n\n**Hand assembled in the USA**",
  short_description: "“A manual turntable with the OA3 tonearm.”",
  photos: [
    { image: 1, alt: "Orbit Theory in walnut" },
    { image: 2, alt: "Logo" },
  ],
  ...overrides,
})

const MARKDOWN = `# Orbit Theory

![Orbit Theory in walnut](https://cdn.maker.example.com/orbit-walnut_400x400.jpg)
[![](https://cdn.maker.example.com/thumb-small.jpg)](https://maker.example.com/x)
![Orbit Theory in walnut](https://cdn.maker.example.com/orbit-walnut.jpg)
![](https://cdn.maker.example.com/logo.svg)

The Orbit Theory is a manual turntable, [made in Woburn](https://maker.example.com/about), with the OA3 tonearm and an acrylic platter. Price: $999.`

function tavily({ status = 200, body } = {}) {
  const calls = []
  const fetcher = async (url, init) => {
    calls.push({ url: String(url), init })
    return Response.json(
      body ?? {
        results: [
          {
            url: page.href,
            raw_content: MARKDOWN,
            images: [
              "https://cdn.maker.example.com/orbit-rear.jpg",
              "data:image/png;base64,AAAA",
            ],
          },
        ],
        failed_results: [],
      },
      { status }
    )
  }
  return { fetcher, calls }
}

function store() {
  const uploaded = []
  const discarded = []
  return {
    uploaded,
    discarded,
    upload: async (path, data) => {
      uploaded.push({ path, size: data.length })
    },
    discard: async (paths) => {
      discarded.push(...paths)
    },
  }
}

test("only public internet addresses count", () => {
  for (const address of [
    "127.0.0.1",
    "10.1.2.3",
    "172.20.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fe80::1",
    "fd00::1",
    "::ffff:127.0.0.1",
    "64:ff9b::7f00:1",
    "2002:7f00:1::1",
  ]) {
    assert.equal(isPublicAddress(address), false, address)
  }
  for (const address of ["8.8.8.8", "151.101.1.140", "2606:4700::1111"]) {
    assert.equal(isPublicAddress(address), true, address)
  }
})

test("publicUrl allows https pages on public hosts only", () => {
  assert.equal(
    publicUrl("https://www.maker.example.com/p#gallery")?.href,
    "https://www.maker.example.com/p"
  )
  for (const text of [
    "http://maker.example.com/p",
    "https://localhost/p",
    "https://printer.local/p",
    "https://intranet/p",
    "https://127.0.0.1/p",
    "https://[::1]/p",
    "https://169.254.169.254/latest/meta-data",
    "https://user:secret@maker.example.com/p",
    "https://maker.example.com:8443/p",
    "file:///etc/passwd",
    "not a url",
  ]) {
    assert.equal(publicUrl(text), null, text)
  }
})

test("the lookup refuses names that resolve to private addresses", async () => {
  const lookupWith = (addresses) =>
    guardedLookup((_host, _family, callback) => callback(null, addresses))
  const run = (lookup, all) =>
    new Promise((resolve) =>
      lookup("maker.example.com", { all }, (error, address, family) =>
        resolve({ error, address, family })
      )
    )

  const rebinding = lookupWith([
    { address: "93.184.215.14", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ])
  assert.equal((await run(rebinding, true)).error?.reason, "blocked")
  assert.equal((await run(rebinding, false)).error?.reason, "blocked")

  const fine = lookupWith([{ address: "93.184.215.14", family: 4 }])
  assert.deepEqual((await run(fine, true)).address, [
    { address: "93.184.215.14", family: 4 },
  ])
  const single = await run(fine, false)
  assert.equal(single.address, "93.184.215.14")
  assert.equal(single.family, 4)
})

test("the link check reads statuses without downloading the page", async () => {
  const answer = (...statuses) => {
    const seen = []
    const requester = async (_url, options) => {
      seen.push(options)
      return { url: page, status: statuses.shift(), type: "", body: null }
    }
    return { requester, seen }
  }

  const ok = answer(200)
  assert.equal(await checkProductPage(page, { requester: ok.requester }), "ok")
  assert.equal(ok.seen[0].method, "HEAD")
  assert.ok(!ok.seen[0].maxBytes)

  const noHead = answer(405, 200)
  assert.equal(
    await checkProductPage(page, { requester: noHead.requester }),
    "ok"
  )
  assert.deepEqual(
    noHead.seen.map(({ method }) => method),
    ["HEAD", "GET"]
  )
  assert.ok(!noHead.seen[1].maxBytes)

  assert.equal(
    await checkProductPage(page, { requester: answer(404, 404).requester }),
    "missing"
  )
  assert.equal(
    await checkProductPage(page, { requester: answer(403, 403).requester }),
    "blocked"
  )
  assert.equal(
    await checkProductPage(page, { requester: answer(500, 502).requester }),
    "unreachable"
  )
  assert.equal(
    await checkProductPage(page, {
      requester: async () => {
        throw new Error("ENOTFOUND")
      },
    }),
    "unreachable"
  )
})

test("the check route needs an admin on this site", async () => {
  const requester = async () => ({
    url: page,
    status: 200,
    type: "",
    body: null,
  })
  const body = { url: page.href }
  const denied = await productPageCheckRoute(
    post("/api/admin/product-page/check", body),
    { authorize: async () => false, requester }
  )
  assert.equal(denied.status, 401)

  const foreign = await productPageCheckRoute(
    post("/api/admin/product-page/check", body, {
      site: "https://evil.example",
    }),
    { authorize: async () => true, requester }
  )
  assert.equal(foreign.status, 403)

  const local = await productPageCheckRoute(
    post("/api/admin/product-page/check", { url: "https://127.0.0.1/" }),
    {
      authorize: async () => true,
      requester: () => assert.fail("Private addresses are never requested"),
    }
  )
  assert.deepEqual(await local.json(), { status: "unreachable" })

  const found = await productPageCheckRoute(
    post("/api/admin/product-page/check", body),
    { authorize: async () => true, requester }
  )
  assert.equal(found.status, 200)
  assert.deepEqual(await found.json(), { status: "ok" })
  assert.match(found.headers.get("cache-control"), /no-store/)
})

test("the page reaches the model with numbered photos and no links", () => {
  const { text, candidates } = compactPage(
    MARKDOWN,
    [
      { url: "https://cdn.maker.example.com/orbit-rear.jpg", alt: "" },
      { url: "data:image/png;base64,AAAA", alt: "" },
    ],
    page
  )
  assert.deepEqual(
    candidates.map(({ url }) => url),
    [
      // The resized copy and the original are one photo; the original wins.
      "https://cdn.maker.example.com/orbit-walnut.jpg",
      "https://cdn.maker.example.com/thumb-small.jpg",
      "https://cdn.maker.example.com/orbit-rear.jpg",
    ]
  )
  assert.equal(candidates[0].alt, "Orbit Theory in walnut")
  assert.match(text, /\[image 1: Orbit Theory in walnut\]/)
  assert.match(text, /\[image 2\]/)
  assert.match(text, /made in Woburn,/)
  assert.doesNotMatch(text, /https?:\/\//)
  assert.doesNotMatch(text, /logo\.svg/)

  const prompt = prefillPrompt({
    url: page,
    text,
    candidates,
    taxonomy,
    slots: 5,
  })
  assert.match(prompt, /Photos allowed: 5/)
  assert.match(prompt, /u-turn-audio: U-Turn Audio/)
  assert.match(prompt, /\[3\] cdn\.maker\.example\.com\/orbit-rear\.jpg/)
})

test("only what the form accepts is kept from the draft", () => {
  const candidates = [
    { url: "https://cdn.maker.example.com/a.jpg", alt: "" },
    { url: "https://cdn.maker.example.com/b.jpg", alt: "B" },
  ]
  const { fields, photos } = suggestionsFromDraft(
    draft({
      brand_slug: "not-a-brand",
      list_price_usd: 1299.99,
      price_unit: "pair",
      description: "Intro.\n\n![x](https://a/b.jpg)\n\n<b>Bold</b>",
      photos: [
        { image: 2, alt: "" },
        { image: 2, alt: "again" },
        { image: 9, alt: "made up" },
        { image: 1, alt: "Front" },
      ],
    }),
    { taxonomy, candidates, slots: 1 }
  )
  assert.equal(fields.brand_slug, undefined)
  assert.equal(fields.category_slug, "turntables")
  assert.equal(fields.msrp, "1299.99")
  assert.equal(fields.price_unit, "pair")
  assert.equal(fields.description, "Intro.\n\nBold")
  assert.equal(
    fields.short_description,
    "A manual turntable with the OA3 tonearm."
  )
  assert.deepEqual(photos, [
    { url: "https://cdn.maker.example.com/b.jpg", alt: "B" },
  ])

  const none = suggestionsFromDraft(
    draft({
      name: "   ",
      list_price_usd: -5,
      price_unit: null,
      description: null,
      short_description: null,
      photos: [],
    }),
    { taxonomy, candidates, slots: 5 }
  )
  assert.equal(none.fields.name, undefined)
  assert.equal(none.fields.msrp, undefined)
  assert.equal(none.fields.price_unit, undefined)
})

test("prefill refuses strangers, other sites, and a missing key", async () => {
  const neverCalled = {
    taxonomy: async () => assert.fail("taxonomy"),
    draft: async () => assert.fail("draft"),
    store: store(),
    fetcher: async () => assert.fail("Tavily must not be called"),
  }
  const body = { url: page.href, photos: 0 }
  const stranger = await productPagePrefillRoute(
    post("/api/admin/product-page/prefill", body),
    { ...neverCalled, admin: async () => null, apiKey: KEY }
  )
  assert.equal(stranger.status, 401)

  const foreign = await productPagePrefillRoute(
    post("/api/admin/product-page/prefill", body, {
      site: "https://evil.example",
    }),
    { ...neverCalled, admin: async () => ({ id: "a" }), apiKey: KEY }
  )
  assert.equal(foreign.status, 403)

  const unset = await productPagePrefillRoute(
    post("/api/admin/product-page/prefill", body),
    { ...neverCalled, admin: async () => ({ id: "a" }), apiKey: " " }
  )
  assert.equal(unset.status, 503)

  const local = await productPagePrefillRoute(
    post("/api/admin/product-page/prefill", {
      url: "https://localhost/p",
      photos: 0,
    }),
    { ...neverCalled, admin: async () => ({ id: "a" }), apiKey: KEY }
  )
  assert.equal(local.status, 400)
})

test("Tavily failures are reworded, never forwarded", async () => {
  for (const [status, expected] of [
    [401, 503],
    [429, 429],
    [432, 503],
    [500, 502],
  ]) {
    const { fetcher } = tavily({
      status,
      body: { detail: { error: `secret provider detail ${KEY}` } },
    })
    const response = await productPagePrefillRoute(
      post("/api/admin/product-page/prefill", { url: page.href, photos: 0 }),
      {
        admin: async () => ({ id: "admin-1" }),
        apiKey: KEY,
        taxonomy: async () => taxonomy,
        draft: async () => assert.fail("draft"),
        store: store(),
        fetcher,
      }
    )
    assert.equal(response.status, expected)
    const text = await response.text()
    assert.doesNotMatch(text, /secret|tvly/)
  }

  const { fetcher } = tavily({
    body: {
      results: [],
      failed_results: [{ url: page.href, error: "Failed" }],
    },
  })
  const failed = await productPagePrefillRoute(
    post("/api/admin/product-page/prefill", { url: page.href, photos: 0 }),
    {
      admin: async () => ({ id: "admin-1" }),
      apiKey: KEY,
      taxonomy: async () => taxonomy,
      draft: async () => assert.fail("draft"),
      store: store(),
      fetcher,
    }
  )
  assert.equal(failed.status, 422)
})

test("prefill reads the page, drafts the form, and stages photos", async () => {
  const { fetcher, calls } = tavily()
  const staged = store()
  const big = await photo(1200, 900)
  const small = await photo(120, 120)
  const downloads = []
  let prompt = ""
  const response = await productPagePrefillRoute(
    post("/api/admin/product-page/prefill", { url: page.href, photos: 18 }),
    {
      admin: async () => ({ id: "admin-1" }),
      apiKey: ` ${KEY} `,
      taxonomy: async () => taxonomy,
      draft: async (text) => {
        prompt = text
        return draft({
          photos: [
            { image: 1, alt: "Orbit Theory in walnut" },
            { image: 2, alt: "Thumbnail" },
            { image: 3, alt: "Rear" },
          ],
        })
      },
      store: staged,
      fetcher,
      requester: async (url, options) => {
        downloads.push({ url: url.href, options })
        return {
          url,
          status: 200,
          type: "image/png",
          body: url.pathname.includes("thumb") ? small : big,
        }
      },
    }
  )
  assert.equal(response.status, 200)

  // Tavily: one advanced Extract of the page, with images, bearer key.
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, "https://api.tavily.com/extract")
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`)
  assert.match(calls[0].init.headers["X-Human-Id"], /^qaudio-[0-9a-f]{24}$/)
  assert.doesNotMatch(calls[0].init.headers["X-Human-Id"], /admin-1/)
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    urls: [page.href],
    extract_depth: "advanced",
    format: "markdown",
    include_images: true,
    timeout: 30,
  })
  // Two photo slots are left of the product's 20.
  assert.match(prompt, /Photos allowed: 2/)

  const { suggestions } = await response.json()
  assert.equal(suggestions.name, "U-Turn Audio Orbit Theory")
  assert.equal(suggestions.brand_slug, "u-turn-audio")
  assert.equal(suggestions.msrp, "999")
  assert.equal(suggestions.price_unit, "each")
  // Only two photos were allowed; the thumbnail was too small to keep.
  assert.equal(downloads.length, 2)
  assert.equal(
    downloads[0].options.headers.Referer,
    "https://maker.example.com/products/orbit-theory"
  )
  assert.ok(downloads[0].options.maxBytes > 0)
  assert.equal(suggestions.images.length, 1)
  const [image] = suggestions.images
  assert.match(image.path, /^uploads\/[0-9a-f-]{36}\.webp$/)
  assert.deepEqual(
    { alt: image.alt, width: image.width, height: image.height },
    { alt: "Orbit Theory in walnut", width: 1200, height: 900 }
  )
  assert.deepEqual(
    staged.uploaded.map(({ path }) => path),
    [image.path]
  )
})

test("Tune's page reader stages photos where its store names them", async () => {
  const staged = store()
  const path =
    "uploads/chat/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.webp"
  const image = await importPhoto(
    { url: "https://maker.example.com/front.png", alt: "Front" },
    {
      page,
      store: { ...staged, path: async () => path },
      requester: async (url) => ({
        url,
        status: 200,
        type: "image/png",
        body: await photo(1200, 900),
      }),
    }
  )
  assert.equal(image?.path, path)
  assert.deepEqual(
    staged.uploaded.map((item) => item.path),
    [path]
  )
})

test("a cancelled prefill removes the photos it staged", async () => {
  const { fetcher } = tavily()
  const staged = store()
  const big = await photo(1600, 1200)
  const controller = new AbortController()
  const request = new Request(`${origin}/api/admin/product-page/prefill`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ url: page.href, photos: 0 }),
    signal: controller.signal,
  })
  const response = await productPagePrefillRoute(request, {
    admin: async () => ({ id: "admin-1" }),
    apiKey: KEY,
    taxonomy: async () => taxonomy,
    draft: async () => draft({ photos: [{ image: 1, alt: "Walnut" }] }),
    store: {
      ...staged,
      upload: async (path, data) => {
        await staged.upload(path, data)
        controller.abort()
      },
    },
    fetcher,
    requester: async (url) => ({
      url,
      status: 200,
      type: "image/png",
      body: big,
    }),
  })
  assert.equal(response.status, 504)
  assert.equal(staged.uploaded.length, 1)
  assert.deepEqual(staged.discarded, [staged.uploaded[0].path])
})

test("a page with nothing to fill says so", async () => {
  const { fetcher } = tavily()
  const response = await productPagePrefillRoute(
    post("/api/admin/product-page/prefill", { url: page.href, photos: 0 }),
    {
      admin: async () => ({ id: "admin-1" }),
      apiKey: KEY,
      taxonomy: async () => taxonomy,
      draft: async () =>
        draft({
          product_page: false,
          name: null,
          brand_slug: null,
          category_slug: null,
          list_price_usd: null,
          price_unit: null,
          description: null,
          short_description: null,
          photos: [],
        }),
      store: store(),
      fetcher,
    }
  )
  assert.equal(response.status, 422)
  assert.match((await response.json()).error, /product page/)
})

test("a reused page keeps authorization, drafts, photo limits, and uploads per request", async () => {
  const staged = store()
  const big = await photo(1200, 900)
  const reads = []
  const prompts = []
  const extracted = {
    markdown: MARKDOWN,
    images: [
      { url: "https://cdn.maker.example.com/orbit-rear.jpg", alt: "Rear" },
    ],
  }
  const dependencies = {
    admin: async () => ({ id: "admin-1" }),
    apiKey: KEY,
    taxonomy: async () => taxonomy,
    extract: async (url, { humanId }) => {
      reads.push({ url: url.href, humanId })
      return extracted
    },
    fetcher: async () =>
      assert.fail("a reused page must not call Tavily directly"),
    draft: async (prompt) => {
      prompts.push(prompt)
      return draft({ photos: [{ image: 1, alt: "Walnut" }] })
    },
    requester: async (url) => ({
      url,
      status: 200,
      type: "image/png",
      body: big,
    }),
    store: staged,
  }
  const request = (photos = 18) =>
    post("/api/admin/product-page/prefill", {
      url: `${page.href}#specifications`,
      photos,
    })
  const first = await productPagePrefillRoute(request(), dependencies)
  const second = await productPagePrefillRoute(request(), dependencies)
  const otherAdmin = await productPagePrefillRoute(request(20), {
    ...dependencies,
    admin: async () => ({ id: "admin-2" }),
  })
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  assert.equal(otherAdmin.status, 200)
  const firstPhoto = (await first.json()).suggestions.images[0].path
  const secondPhoto = (await second.json()).suggestions.images[0].path
  assert.notEqual(firstPhoto, secondPhoto)
  assert.equal(staged.uploaded.length, 2)
  assert.equal((await otherAdmin.json()).suggestions.images, undefined)
  assert.equal(prompts.length, 3)
  assert.match(prompts[0], /Photos allowed: 2/)
  assert.match(prompts[2], /Photos allowed: 0/)
  assert.ok(reads.every(({ url }) => url === page.href))
  assert.equal(reads[0].humanId, reads[1].humanId)
  assert.notEqual(reads[0].humanId, reads[2].humanId)

  const stranger = await productPagePrefillRoute(request(), {
    ...dependencies,
    admin: async () => null,
  })
  const foreign = await productPagePrefillRoute(
    post(
      "/api/admin/product-page/prefill",
      { url: page.href },
      {
        site: "https://evil.example",
      }
    ),
    dependencies
  )
  assert.equal(stranger.status, 401)
  assert.equal(foreign.status, 403)
  assert.equal(reads.length, 3)
})

test("closing an editor during a shared page read skips drafting and photo staging", async () => {
  const controller = new AbortController()
  const request = new Request(`${origin}/api/admin/product-page/prefill`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ url: page.href }),
    signal: controller.signal,
  })
  const response = await productPagePrefillRoute(request, {
    admin: async () => ({ id: "admin-1" }),
    apiKey: KEY,
    taxonomy: async () => assert.fail("catalog must not be read after closing"),
    draft: async () =>
      assert.fail("an abandoned prefill must not call the model"),
    extract: async () => {
      controller.abort()
      return { markdown: MARKDOWN, images: [] }
    },
    store: {
      upload: async () => assert.fail("an abandoned prefill must not upload"),
      discard: async () => {},
    },
  })
  assert.equal(response.status, 504)
})
