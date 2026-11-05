// Read-only integration check for the pinned eve release. No model or site writes.
// Run: node scripts/verify-agent-catalog.mjs
import assert from "node:assert/strict"
import { execSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { dirname, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import ts from "typescript"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
// Load the app's TypeScript without adding a test runner or changing its config.
registerHooks({
  resolve(specifier, context, next) {
    if (/^next\/(image|link)$/.test(specifier)) {
      const entry = import.meta.resolve(`${specifier}.js`)
      return {
        url: `data:text/javascript,${encodeURIComponent(`import entry from ${JSON.stringify(entry)}; export default entry.default ?? entry;`)}`,
        shortCircuit: true,
      }
    }
    if (specifier === "next/navigation")
      return next("next/navigation.js", context)
    let candidate
    if (specifier.startsWith("@/"))
      candidate = resolve(root, specifier.slice(2))
    else if (
      specifier.startsWith(".") &&
      context.parentURL?.startsWith(pathToFileURL(root).href)
    ) {
      candidate = fileURLToPath(new URL(specifier, context.parentURL))
    }
    if (candidate) {
      for (const suffix of ["", ".ts", ".tsx"]) {
        if (
          existsSync(candidate + suffix) &&
          /\.(ts|tsx|css)$/.test(candidate + suffix)
        ) {
          return {
            url: pathToFileURL(candidate + suffix).href,
            shortCircuit: true,
          }
        }
      }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (
      url.startsWith(pathToFileURL(root).href) &&
      !url.includes("/node_modules/")
    ) {
      if (url.endsWith(".css"))
        return {
          format: "module",
          source: "export default {}",
          shortCircuit: true,
        }
      if (/\.tsx?$/.test(url))
        return {
          format: "module",
          shortCircuit: true,
          source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
              jsx: ts.JsxEmit.ReactJSX,
            },
            fileName: fileURLToPath(url),
          }).outputText,
        }
    }
    return next(url, context)
  },
})

// A fixed command through the shell, so pnpm's Windows shim runs too.
execSync("pnpm exec eve info --json", { cwd: root, stdio: "pipe" })
const manifest = JSON.parse(
  readFileSync(resolve(root, ".eve/compile/compiled-agent-manifest.json"))
)
// Private seams are deliberately limited to this verifier, pinned to eve rc.1.
const eveRoot = dirname(fileURLToPath(import.meta.resolve("eve/package.json")))
const internal = (path) =>
  import(pathToFileURL(resolve(eveRoot, "dist/src", path)).href)
const { buildStepCatalog } = await internal("execution/catalog/step-catalog.js")
const { BundleKey } = await internal("runtime/sessions/runtime-context-keys.js")
const { toInputSchema } = await internal("tools/schema.js")
const { checkToolCallInput } = await internal("harness/tool-call-io.js")
const { previewToolName, SAVE_TOOLS } =
  await import("../lib/admin/tool-names.ts")
const schemas = await import("../lib/admin/schemas.ts")
const tools = new Map()
for (const entry of manifest.tools) {
  const { default: definition } = await import(
    pathToFileURL(resolve(root, "agent", entry.logicalPath)).href
  )
  assert.equal(definition.deferred === true, entry.deferred === true)
  tools.set(entry.name, {
    ...definition,
    name: entry.name,
    inputSchema: toInputSchema(definition.inputSchema),
  })
}
const bundle = {
  resolvedAgent: { skills: manifest.skills },
  subagentRegistry: { dynamicResolvers: [] },
}
const catalog = buildStepCatalog({
  agentTools: tools,
  ctx: { get: (key) => (key === BundleKey ? bundle : undefined) },
  session: {},
  endsTurn: true,
})
assert.equal(catalog.deferred.size, 21)
assert.deepEqual(
  [...tools.values()]
    .filter((tool) => !tool.deferred)
    .map((tool) => tool.name)
    .sort(),
  [
    "ask_dates",
    "ask_question",
    "design_story",
    "edit_story",
    "flow_progress",
    "view_photos",
    "web_fetch",
  ]
)
assert(
  catalog.advertised.has("eve__search") &&
    catalog.advertised.has("eve__tool") &&
    catalog.advertised.has("eve__skill")
)
for (const [group, count] of Object.entries({
  hours: 4,
  products: 5,
  news: 4,
  deals: 3,
  instagram: 5,
})) {
  const result = await catalog.advertised
    .get("eve__search")
    .execute({ query: `${group}__` })
  assert.equal(result.results.length, count)
  assert.equal(result.remaining, 0)
  assert(
    result.results.every(
      (entry) => entry.tool.startsWith(`${group}__`) && entry.signature
    )
  )
}
const mixed = await catalog.advertised
  .get("eve__search")
  .execute({ query: "read", limit: 50 })
assert(
  new Set(mixed.results.map((entry) => entry.tool.split("__")[0])).size > 1
)
const id = "00000000-0000-4000-8000-000000000001"
const fixtures = {
  set_weekly_hours: [
    schemas.weeklyHoursInputSchema,
    { week: Array.from({ length: 7 }, () => ({ kind: "closed" })) },
  ],
  save_hours_change: [
    schemas.hoursChangeInputSchema,
    {
      starts_on: "2030-01-01",
      ends_on: "2030-01-01",
      kind: "closed",
      note: "Holiday",
    },
  ],
  delete_hours_change: [
    schemas.deleteHoursChangeInputSchema,
    { id, summary: "Holiday" },
  ],
  save_product: [
    schemas.productInputSchema,
    {
      slug: "sample",
      category_slug: "speakers",
      brand_slug: "sample",
      name: "Sample",
      short_description: "",
      description: "",
      price_cents: 100,
      msrp_cents: null,
      price_unit: "each",
      condition: "New",
      ready_for_audition: false,
      manufacturer_url: null,
      status: "draft",
      images: [],
    },
  ],
  delete_product: [schemas.deleteProductInputSchema, { id, name: "Sample" }],
  reorder_products: [schemas.reorderProductsInputSchema, { product_ids: [id] }],
  save_sale: [
    schemas.saleProposalSchema,
    {
      title: "Sample",
      products: [
        { id, name: "Sample", price_cents: 100000, msrp_cents: 120000 },
      ],
      discount: { kind: "percent", percent: 25 },
      off: "msrp",
      rounding: "cent",
      starts_at: "now",
      ends_at: "2030-01-01T23:59",
    },
  ],
  end_sale: [
    schemas.endSaleInputSchema,
    { title: "Sample", products: [{ id, name: "Sample" }] },
  ],
  save_news_post: [
    schemas.newsPostInputSchema,
    {
      slug: "sample",
      title: "Sample",
      body: [],
      cover: null,
      status: "draft",
      published_at: null,
    },
  ],
  delete_news_post: [
    schemas.deleteNewsPostInputSchema,
    { id, title: "Sample" },
  ],
  save_deal: [
    schemas.dealInputSchema,
    {
      title: "Sample",
      summary: "",
      note: "",
      status: "draft",
      starts_at: null,
      ends_at: null,
      items: [],
    },
  ],
  delete_deal: [schemas.deleteDealInputSchema, { id, title: "Sample" }],
  save_instagram_post: [
    schemas.instagramPostProposalSchema,
    {
      kind: "feed",
      photos: [
        {
          path: "uploads/sample.webp",
          width: 1600,
          height: 1200,
          alt: "Sample",
        },
        {
          path: "products/sample.webp",
          width: 1200,
          height: 1200,
          alt: "Sample",
        },
      ],
      caption: "Sample #hifi",
      when: "draft",
    },
  ],
  delete_instagram_post: [
    schemas.deleteInstagramPostInputSchema,
    { id: "0000000000000000000000a1", summary: "Draft: “Sample”" },
  ],
  retry_instagram_post: [
    schemas.retryInstagramPostInputSchema,
    { id: "0000000000000000000000a1", summary: "Failed: “Sample”" },
  ],
}
let writes = 0
for (const [name, definition] of catalog.deferred) {
  assert(!catalog.advertised.has(name))
  const legacy = previewToolName(name)
  const input = legacy ? fixtures[legacy][1] : {}
  const routed = catalog.resolve({
    toolName: "eve__tool",
    callId: name,
    input: { name, input },
  })
  assert.equal(routed.definition, definition)
  assert.equal(routed.call.toolName, name)
  assert.equal(routed.call.callId, name)
  assert.equal(routed.call.input, input)
  if (!legacy) {
    // Reads only: no approval, and nothing to preview.
    assert(!SAVE_TOOLS.has(name))
    assert.equal(definition.approval, undefined)
    continue
  }
  writes++
  assert(SAVE_TOOLS.has(name) && SAVE_TOOLS.has(legacy))
  assert.equal(previewToolName(legacy), legacy)
  assert.equal(definition.inputSchema, fixtures[legacy][0])
  assert.equal(
    await definition.approval.request({ toolName: name, toolInput: input }),
    "user-approval"
  )
  assert(definition.approval.prompt({ input, toolName: name, callId: name }))
  assert.equal(
    (await checkToolCallInput(definition, input, name)).kind,
    "valid"
  )
}
assert.equal(writes, 13)
// Products are saved and deleted in the admin's Products tab; the agent has
// no product writes left, only their names for older chats' cards.
const retired = ["products__save_product", "products__delete_product"]
for (const name of retired) {
  assert(!tools.has(name) && !catalog.deferred.has(name))
  assert(SAVE_TOOLS.has(name) && SAVE_TOOLS.has(previewToolName(name)))
}
assert.equal(previewToolName("unknown__save_news_post"), undefined)
assert.equal(
  (
    await checkToolCallInput(
      catalog.advertised.get("eve__tool"),
      { name: "news__save_news_post", input: { title: 1 } },
      "invalid"
    )
  ).kind,
  "invalid"
)

// Exercise the real preview renderer for every canonical AND historical write,
// including the retired product writes older chats still show.
const { createElement } = await import("react")
const { renderToStaticMarkup } = await import("react-dom/server")
const { AppRouterContext } =
  await import("next/dist/shared/lib/app-router-context.shared-runtime.js")
const { PathnameContext } =
  await import("next/dist/shared/lib/hooks-client-context.shared-runtime.js")
const { ChangePreview } = await import("../components/admin/change-preview.tsx")
const data = {
  schedule: { weekly: Array(7).fill("closed"), changes: [] },
  taxonomy: {
    categories: [
      {
        slug: "speakers",
        name: "Speakers",
        wheel_label: "Speakers",
        artwork_path: "/sample.svg",
        scene_path: "/sample.svg",
      },
    ],
    brands: [{ slug: "sample", name: "Sample", logo_path: "/sample.svg" }],
  },
  products: [],
  news: [],
  deals: [],
}
let renders = 0
for (const name of [...catalog.deferred.keys(), ...retired]) {
  const legacy = previewToolName(name)
  if (!legacy) continue
  const input = fixtures[legacy][1]
  const render = (tool) =>
    renderToStaticMarkup(
      createElement(
        AppRouterContext.Provider,
        { value: {} },
        createElement(
          PathnameContext.Provider,
          { value: "/admin" },
          createElement(ChangePreview, { tool, input, data })
        )
      )
    )
  assert.equal(render(name), render(legacy))
  assert(!render(name).includes("No preview for this change."))
  assert(!render(name).includes("Unknown category"))
  renders += 2
}
assert.equal(renders, 30)
// A sale's card shows the product as the shop will during the sale: 25% off
// the $1,200 list price is $900, against the crossed-out list price.
const saleCard = renderToStaticMarkup(
  createElement(
    AppRouterContext.Provider,
    { value: {} },
    createElement(
      PathnameContext.Provider,
      { value: "/admin" },
      createElement(ChangePreview, {
        tool: "products__save_sale",
        input: fixtures.save_sale[1],
        data: {
          ...data,
          products: [
            {
              id,
              slug: "sample",
              name: "Sample",
              short_description: "",
              description: "",
              price_cents: 100000,
              msrp_cents: 120000,
              price_unit: "each",
              condition: "New",
              ready_for_audition: false,
              manufacturer_url: null,
              status: "published",
              category: data.taxonomy.categories[0],
              brand: data.taxonomy.brands[0],
              images: [],
            },
          ],
        },
      })
    )
  )
)
assert(saleCard.includes("25% off MSRP"))
assert(saleCard.includes("$900"))
assert(saleCard.includes("<s>$1,200</s>"))
// A pending carousel's card adds the reorderable photo row, and the post
// follows the arranged order.
const arranged = renderToStaticMarkup(
  createElement(ChangePreview, {
    tool: "instagram__save_post",
    input: fixtures.save_instagram_post[1],
    data,
    photoOrder: { order: [1, 0], onOrder() {} },
  })
)
assert(arranged.includes('aria-label="Photo order"'))
// The post's photos carry their alt text; the row's thumbnails don't.
const slides = [
  ...arranged.matchAll(/src="[^"]*\/media\/([^"]+)" alt="Sample"/g),
]
assert.deepEqual(
  slides.map((match) => match[1]),
  ["products/sample.webp", "uploads/sample.webp"]
)
console.log(
  "Catalog verified: 21 deferred (hours 4, products 5, news 4, deals 3, instagram 5); 7 authored direct helpers; discovery across groups; canonical routing; all 13 approval/schema policies; read tools approval-free; retired product writes absent but still previewed; 30 current/historical preview renders, plus a sale card and an arranged carousel. No site data read or written."
)
