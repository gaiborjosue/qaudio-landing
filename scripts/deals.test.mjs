import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "../lib/supabase" &&
      context.parentURL?.includes("/agent/tools/deals__")
    )
      return {
        url: `data:text/javascript,${encodeURIComponent("export const callerSupabase = () => globalThis.__dealClient; export const failure = (what, error) => new Error(what + ': ' + error.message);")}`,
        shortCircuit: true,
      }
    if (
      specifier === "../lib/site-cache" &&
      context.parentURL?.includes("/agent/tools/deals__")
    )
      return {
        url: `data:text/javascript,${encodeURIComponent("export const refreshAfterSave = (_ctx, output) => output;")}`,
        shortCircuit: true,
      }
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

const { dealInputSchema } = await import("../lib/admin/schemas.ts")
const { default: saveDeal } = await import("../agent/tools/deals__save_deal.ts")
const { default: listDeals } =
  await import("../agent/tools/deals__list_deals.ts")
const approval = await import("../lib/admin/approval-choice.ts")
const deals = await import("../lib/admin/deal-save.ts")
const editor = await import("../lib/admin/deal-editor.ts")
const { changedInputFields } = await import("../lib/admin/product-editor.ts")
const id = "00000000-0000-4000-8000-000000000081"
const path = `uploads/chat/${id}/${id}.webp`
const image = { path, width: 1200, height: 1800, alt: "Closeout flyer" }
const input = {
  title: "Closeouts",
  summary: "",
  note: "",
  status: "draft",
  starts_at: null,
  ends_at: null,
  items: [],
}
const product = {
  brand: "Sample",
  name: "Amplifier",
  condition: "demo",
  price_cents: 50000,
}

function database({
  existing = {},
  copyError = null,
  trackingError = null,
  writeError = null,
} = {}) {
  const calls = []
  const row = {
    id,
    kind: "qdeal",
    updated_at: "2030-01-01T00:00:00+00:00",
    title: input.title,
    status: "draft",
    starts_at: null,
    ends_at: null,
    image_path: null,
    image_width: null,
    image_height: null,
    image_alt: "",
    deal_items: [],
    ...existing,
  }
  return {
    calls,
    row,
    from(table) {
      const request = { table, op: "select", filters: [] }
      const query = {
        select(columns) {
          request.columns = columns
          return query
        },
        insert(body) {
          request.op = "insert"
          request.body = body
          return query
        },
        update(body) {
          request.op = "update"
          request.body = body
          return query
        },
        delete() {
          request.op = "delete"
          return query
        },
        eq(...filter) {
          request.filters.push(filter)
          return query
        },
        in(...filter) {
          request.filters.push(filter)
          return query
        },
        order() {
          return query
        },
        maybeSingle() {
          calls.push(request)
          return Promise.resolve({ data: { ...row }, error: null })
        },
        then(resolve, reject) {
          calls.push(request)
          let result
          // A write guarded by an older revision finds nothing.
          const stale = request.filters.some(
            ([column, value]) =>
              column === "updated_at" && value !== row.updated_at
          )
          if (table === "deals" && request.op !== "select" && stale) {
            result = { data: [], error: null }
          } else if (table === "deals" && request.op !== "select") {
            if (!writeError) Object.assign(row, request.body)
            result = {
              data: writeError ? null : [{ ...row }],
              error: writeError,
            }
          } else
            result = {
              data: table === "deals" ? [{ ...row }] : [],
              error: null,
            }
          return Promise.resolve(result).then(resolve, reject)
        },
      }
      return query
    },
    async rpc(name, args) {
      calls.push({ rpc: name, args })
      return { error: trackingError }
    },
    storage: {
      from(bucket) {
        return {
          async copy(source, destination, options) {
            calls.push({ copy: { bucket, source, destination, options } })
            return { error: copyError }
          },
        }
      },
    },
  }
}

test("QDeals accept image, text and product combinations while rejecting invalid image metadata", () => {
  for (const fields of [
    {},
    { image },
    { items: [product] },
    { image, summary: "Details", items: [product] },
    { image: null },
  ])
    assert.equal(
      dealInputSchema.safeParse({ ...input, ...fields }).success,
      true
    )
  assert.equal(dealInputSchema.parse(input).image, undefined)
  for (const photo of [
    { ...image, path: "https://example.com/flyer.jpg" },
    { ...image, path: "deals/../private.jpg" },
    { ...image, path: "brands/logo.png" },
    { ...image, path: "deals/flyer.svg" },
    { ...image, width: 0 },
    { ...image, height: -1 },
    { ...image, alt: " " },
  ])
    assert.equal(
      dealInputSchema.safeParse({ ...input, image: photo }).success,
      false
    )
  for (const folder of ["deals", "products", "news", "instagram"])
    assert.equal(
      dealInputSchema.safeParse({
        ...input,
        image: { ...image, path: `${folder}/flyer.webp` },
      }).success,
      true
    )
})

test("an approved image-only deal promotes the private upload before saving its public path", async () => {
  const db = database()
  globalThis.__dealClient = db
  const result = await saveDeal.execute(
    dealInputSchema.parse({ ...input, image }),
    {}
  )
  assert.equal(db.calls[0].rpc, "prepare_media_copy")
  assert.deepEqual(db.calls[1].copy, {
    bucket: "chat-uploads",
    source: path,
    destination: `deals/${id}.webp`,
    options: { destinationBucket: "media" },
  })
  const write = db.calls[2]
  assert.equal(write.table, "deals")
  assert.equal(write.body.image_path, `deals/${id}.webp`)
  assert.equal(write.body.image_width, image.width)
  assert.equal(write.body.image_height, image.height)
  assert.equal(write.body.image_alt, image.alt)
  assert(!("image" in write.body))
  assert.equal(
    db.calls.some(
      (call) => call.table === "deal_items" && call.op === "insert"
    ),
    false
  )
  assert.deepEqual(result.image, { ...image, path: `deals/${id}.webp` })
  assert.deepEqual(result.revalidate, ["deals"])
  assert.equal(await saveDeal.approval.request({}), "user-approval")
})

test("list/read/edit keeps the image, explicit null clears it, and saved public images are reused", async () => {
  const db = database({
    existing: {
      image_path: `deals/${id}.webp`,
      image_width: 1200,
      image_height: 1800,
      image_alt: image.alt,
    },
  })
  globalThis.__dealClient = db
  const listed = (await listDeals.execute({}, {})).deals[0]
  assert.deepEqual(listed.image, { ...image, path: `deals/${id}.webp` })
  assert(!("image_path" in listed))
  await saveDeal.execute(
    dealInputSchema.parse({ ...input, id, note: "Updated note" }),
    {}
  )
  const omitted = db.calls.find(
    (call) => call.table === "deals" && call.op === "update"
  )
  assert(!("image_path" in omitted.body))
  assert.equal(db.row.image_path, `deals/${id}.webp`)
  await saveDeal.execute(
    dealInputSchema.parse({ ...input, id, image: listed.image }),
    {}
  )
  assert.equal(
    db.calls.some((call) => call.copy || call.rpc),
    false
  )
  await saveDeal.execute(
    dealInputSchema.parse({ ...input, id, image: null }),
    {}
  )
  assert.equal(db.row.image_path, null)
  assert.equal(db.row.image_width, null)
  assert.equal(db.row.image_height, null)
  assert.equal(db.row.image_alt, "")
})

test("failed upload retention or copying stops before writing a deal", async () => {
  for (const options of [
    { trackingError: { message: "Denied" } },
    { copyError: { message: "Upload failed" } },
  ]) {
    const db = database(options)
    globalThis.__dealClient = db
    await assert.rejects(
      saveDeal.execute(dealInputSchema.parse({ ...input, image }), {})
    )
    assert.equal(
      db.calls.some((call) => call.table),
      false
    )
  }
})

test("Publish, Save draft and Schedule preserve the image and require fresh approval for a changed image", () => {
  const proposal = { ...input, image }
  const now = "2030-11-01T10:00"
  for (const release of ["now", "draft", "schedule"]) {
    const at = release === "schedule" ? "2030-11-02T12:00" : null
    const fields = approval.releaseFields(
      "save_deal",
      proposal,
      release,
      at,
      now
    )
    assert.deepEqual(
      approval.withFields("save_deal", proposal, fields).image,
      image
    )
  }
  const card = (callId, proposed) => ({
    role: "assistant",
    parts: [
      { type: "tool", name: "deals__save_deal", callId, input: proposed },
    ],
  })
  const approved = {
    role: "user",
    parts: [
      {
        type: "text",
        text: approval.approvedMessage(
          "save_deal",
          "now",
          { status: "published", starts_at: null },
          null
        ),
      },
    ],
  }
  const changed = {
    ...proposal,
    status: "published",
    image: { ...image, alt: "Different flyer" },
  }
  assert.equal(
    approval.approvedProposals([
      card("before", proposal),
      approved,
      card("after", changed),
    ]).approved.size,
    0
  )
  assert.deepEqual(
    [
      ...approval.approvedProposals([
        card("before", proposal),
        approved,
        card("after", { ...proposal, status: "published" }),
      ]).approved,
    ],
    ["after"]
  )
})

test("featured sales go to /sales, keep their kind on edits, and can be turned down on the card", async () => {
  const { cardHeading } = await import("../lib/admin/card-heading.ts")
  const sale = { ...input, title: "Bronze November", kind: "sale" }
  assert.equal(dealInputSchema.parse(input).kind, undefined)

  const created = database({ existing: { kind: "sale" } })
  globalThis.__dealClient = created
  const added = await saveDeal.execute(dealInputSchema.parse(sale), {})
  const insert = created.calls.find(
    (call) => call.table === "deals" && call.op === "insert"
  )
  assert.equal(insert.body.kind, "sale")
  assert.equal(added.url, "/sales")
  assert.equal(
    saveDeal.approval.prompt({ input: dealInputSchema.parse(sale) }),
    "Feature “Bronze November” on the Sales page?"
  )

  // An edit that leaves out the kind keeps the saved one.
  const edited = database({ existing: { kind: "sale" } })
  globalThis.__dealClient = edited
  const saved = await saveDeal.execute(
    dealInputSchema.parse({ ...input, id, note: "Ends soon" }),
    {}
  )
  const update = edited.calls.find(
    (call) => call.table === "deals" && call.op === "update"
  )
  assert(!("kind" in update.body))
  assert.equal(saved.url, "/sales")
  const listed = await listDeals.execute({}, {})
  assert.equal(listed.deals[0].kind, "sale")

  // Only a new featured sale offers Don't feature; its note skips the step.
  const skip = approval.skipChoice("deals__save_deal", sale)
  assert.equal(skip.label, "Don’t feature")
  assert(approval.skippedStep(skip.note))
  assert(!approval.skippedStep("Make the title shorter"))
  assert.equal(approval.skipChoice("deals__save_deal", input), null)
  assert.equal(approval.skipChoice("deals__save_deal", { ...sale, id }), null)
  assert.equal(approval.skipChoice("news__save_news_post", sale), null)
  assert.deepEqual(
    cardHeading({
      name: "deals__save_deal",
      input: sale,
      label: "Add “Bronze November”",
      phase: "denied",
      note: false,
      skipped: true,
      now: "2030-01-01T00:00",
    }),
    { title: "Featured sale “Bronze November”", status: "Skipped" }
  )
})

const fail = (what, error) => new Error(`${what}: ${error.message}`)
const record = {
  id,
  kind: "qdeal",
  title: "Closeouts",
  summary: "Limited quantities",
  note: "",
  status: "draft",
  sort_order: 0,
  starts_at: null,
  ends_at: null,
  image: null,
  updated_at: "2030-01-01T00:00:00+00:00",
  items: [
    {
      brand: "Rega",
      name: "Planar 3",
      condition: "demo",
      price_cents: 89900,
      product_id: null,
    },
  ],
}

test("the Deals tab writes only the fields the owner changed", async () => {
  const values = editor.valuesFromDeal(record)
  // The form reads back exactly what it started from.
  const started = dealInputSchema.parse(editor.inputFromDeal(values))
  assert.equal(started.items[0].price_cents, 89900)
  assert.deepEqual(changedInputFields(started, started), [])

  const titled = dealInputSchema.parse(
    editor.inputFromDeal({ ...values, title: "Closeouts: last call" })
  )
  const fields = changedInputFields(titled, started)
  assert.deepEqual(fields, ["title"])
  const db = database()
  await deals.saveDeal(db, titled, fail, new Set(fields))
  const update = db.calls.find(
    (call) => call.table === "deals" && call.op === "update"
  )
  assert.deepEqual(update.body, { title: "Closeouts: last call" })
  assert(!db.calls.some((call) => call.table === "deal_items"))

  // Products are written as a whole list, only when they changed.
  const listed = db.calls.length
  const reordered = dealInputSchema.parse(
    editor.inputFromDeal({
      ...values,
      items: [
        ...values.items,
        { ...values.items[0], key: "b", name: "Planar 6" },
      ],
    })
  )
  await deals.saveDeal(
    db,
    reordered,
    fail,
    new Set(changedInputFields(reordered, started))
  )
  const inserted = db.calls
    .slice(listed)
    .find((call) => call.table === "deal_items" && call.op === "insert")
  assert.deepEqual(
    inserted.body.map((item) => item.name),
    ["Planar 3", "Planar 6"]
  )
})

test("Tune's save refuses a deal changed since it read it", async () => {
  const db = database({ existing: { updated_at: "2030-01-02T00:00:00+00:00" } })
  await assert.rejects(
    deals.saveDeal(
      db,
      dealInputSchema.parse({
        ...input,
        id,
        updated_at: "2030-01-01T00:00:00+00:00",
      }),
      fail
    ),
    /changed since you read it, so nothing was saved/
  )
  assert(!db.calls.some((call) => call.table === "deal_items"))
})

test("a deal row can be used gear linked to its shop product", () => {
  const product = {
    id: "00000000-0000-4000-8000-000000000091",
    name: "McIntosh MC300",
    condition: "Used",
    price_cents: 450000,
    brand: { slug: "mcintosh", name: "McIntosh" },
  }
  const row = editor.itemFromProduct(product, "row")
  assert.deepEqual(row, {
    key: "row",
    product_id: product.id,
    brand: "McIntosh",
    name: "McIntosh MC300",
    condition: "used",
    price: "4500",
  })
  const deal = dealInputSchema.parse(
    editor.inputFromDeal({
      ...editor.valuesFromDeal(),
      title: "Used",
      items: [row],
    })
  )
  assert.deepEqual(deal.items[0], {
    brand: "McIntosh",
    name: "McIntosh MC300",
    condition: "used",
    price_cents: 450000,
    product_id: product.id,
  })
  // A new deal starts published as a QDeal unless a kind is given.
  assert.equal(editor.valuesFromDeal().kind, "qdeal")
  assert.equal(editor.valuesFromDeal(undefined, "sale").kind, "sale")
})

test("the Deals tab tells where each deal stands and filters by kind and status", () => {
  const now = "2030-06-15T12:00"
  const item = (overrides) => ({
    id: overrides.title,
    kind: "qdeal",
    status: "published",
    startsAt: null,
    endsAt: null,
    ...overrides,
  })
  const list = [
    item({ title: "Live" }),
    item({ title: "Soon", startsAt: "2030-07-01T09:00" }),
    item({ title: "Over", endsAt: "2030-06-01T23:59" }),
    item({ title: "Hidden", status: "draft" }),
    item({ title: "Bronze", kind: "sale", endsAt: "2030-06-30T23:59" }),
  ]
  assert.deepEqual(
    list.map((deal) => editor.dealState(deal, now)),
    ["live", "scheduled", "ended", "draft", "live"]
  )
  const titles = (filters) =>
    editor
      .filterDeals(list, { search: "", kind: "", state: "", ...filters }, now)
      .map((deal) => deal.title)
  assert.deepEqual(titles({ kind: "sale" }), ["Bronze"])
  assert.deepEqual(titles({ state: "live" }), ["Live", "Bronze"])
  assert.deepEqual(titles({ search: "bronze" }), ["Bronze"])
  assert.equal(
    editor.dealChatMessage({ id, title: "Closeouts" }),
    `I want to edit the deal “Closeouts”.\nItem: deal ${id}`
  )
})

test("status changes from the table save each deal", async () => {
  const db = database()
  assert.deepEqual(
    await deals.saveDealQuickEdits(db, [{ id, status: "published" }], fail),
    { saved: 1 }
  )
  assert.equal(db.row.status, "published")
})
