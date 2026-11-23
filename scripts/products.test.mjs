import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

// Tune's product tools and the product form's partial saves, with Supabase
// replaced by a fake: what a change writes (score, sold used gear, copy),
// the input schemas, the stale-read guard, partial failures, and the form's
// rebase over a newer save.

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

const { productUpdate, writtenFields } =
  await import("../lib/admin/product-changes.ts")
const { saveProduct, saveProductQuickEdits, updateProducts } =
  await import("../lib/admin/product-save.ts")
const {
  createProductInputSchema,
  productFieldsSchema,
  productInputSchema,
  productQuickEditSchema,
  updateProductsInputSchema,
} = await import("../lib/admin/schemas.ts")
const { changedInputFields, inputFromValues, rebaseValues, valuesFrom } =
  await import("../lib/admin/product-editor.ts")
const { wordDiff } = await import("../lib/admin/text-diff.ts")

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`
const AT = "2030-01-01T00:00:00+00:00"
const fail = (what, error) => new Error(`${what}: ${error.message}`)

const basis = {
  category_slug: "used-equipment",
  condition: "Used",
  condition_note: "Used (final sale) · 6 out of 10",
  availability: "available",
  status: "published",
}

test("a change writes only its fields, with the score kept beside the note's terms", () => {
  assert.deepEqual(productUpdate(basis, { status: "draft" }), {
    status: "draft",
  })
  assert.deepEqual(productUpdate(basis, { condition_score: 8 }), {
    condition_note: "Used (final sale) · 8 out of 10",
  })
  // The saved score leaves the note untouched.
  assert.deepEqual(productUpdate(basis, { condition_score: 6 }), {})
  assert.deepEqual(
    productUpdate(basis, { condition_note: "Used", condition_score: 9 }),
    { condition_note: "Used · 9 out of 10" }
  )
  const copy = productUpdate(basis, {
    name: "  Rega Planar 3 ",
    short_description: " A turntable. ",
    description: "What it is.\n\n- A feature",
  })
  assert.equal(copy.name, "Rega Planar 3")
  assert.equal(copy.short_description, "A turntable.")
  assert.equal(copy.description_intro, "What it is.\n\n- A feature")
  assert.deepEqual(copy.features, [])
  assert.deepEqual(writtenFields(copy, { description: "x" }).sort(), [
    "description",
    "name",
    "short_description",
  ])
})

test("used gear that's sold leaves the shop as a draft, as in the form", () => {
  assert.deepEqual(productUpdate(basis, { availability: "sold" }), {
    availability: "sold",
    status: "draft",
  })
  assert.deepEqual(
    productUpdate(
      { ...basis, availability: "sold", status: "draft" },
      { status: "published" }
    ),
    { status: "draft" }
  )
  // New stock that sells out stays as it is.
  assert.deepEqual(
    productUpdate(
      { ...basis, category_slug: "amplifiers", condition: "New" },
      { availability: "sold" }
    ),
    { availability: "sold" }
  )
})

test("change proposals name each product once with at least one change", () => {
  const product = { id: id(1), name: "A", updated_at: AT, changes: {} }
  assert(!updateProductsInputSchema.safeParse({ products: [product] }).success)
  const hide = { ...product, changes: { status: "draft" } }
  assert(updateProductsInputSchema.safeParse({ products: [hide] }).success)
  assert(
    !updateProductsInputSchema.safeParse({ products: [hide, hide] }).success
  )
  assert(
    !updateProductsInputSchema.safeParse({
      products: [{ ...hide, changes: { condition_score: 11 } }],
    }).success
  )
  assert(
    !updateProductsInputSchema.safeParse({
      products: Array.from({ length: 101 }, (_, n) => ({
        ...hide,
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
      })),
    }).success
  )
  const created = {
    slug: "sample",
    category_slug: "speakers",
    brand_slug: null,
    name: "Sample",
    short_description: "",
    description: "",
    price_cents: null,
    msrp_cents: null,
    price_unit: "each",
    condition: "New",
    ready_for_audition: false,
    manufacturer_url: null,
    status: "draft",
    images: [],
  }
  assert(!createProductInputSchema.safeParse(created).success)
  assert(
    createProductInputSchema.safeParse({
      ...created,
      short_description: "A sample.",
    }).success
  )
  assert(productFieldsSchema.safeParse(["status", "images"]).success)
  assert(!productFieldsSchema.safeParse(["id"]).success)
})

/** A fake Supabase client: products by id, and a log of every query. */
function fakeDb(rows, { failOn } = {}) {
  const log = []
  const respond = (q) => {
    if (q.table === "products" && q.op === "select") {
      const ids = q.filters.find(([kind]) => kind === "in")?.[2] ?? []
      return { data: rows.filter((row) => ids.includes(row.id)), error: null }
    }
    if (q.table === "products" && q.op === "update") {
      const target = q.filters.find(([, column]) => column === "id")[2]
      if (target === failOn)
        return { data: null, error: { message: "a value breaks a rule" } }
      const at = q.filters.find(([, column]) => column === "updated_at")?.[2]
      const row = rows.find((item) => item.id === target)
      if (!row || (at && row.updated_at !== at))
        return { data: [], error: null }
      Object.assign(row, q.body, { updated_at: "2030-01-02T00:00:00+00:00" })
      const { name, slug, status, updated_at } = row
      return {
        data: [{ id: row.id, name, slug, status, updated_at }],
        error: null,
      }
    }
    return { data: [], error: null }
  }
  return {
    log,
    from(table) {
      const q = { table, op: "select", filters: [], body: null }
      const builder = {
        select: () => builder,
        update: (body) => Object.assign(q, { op: "update", body }) && builder,
        insert: (body) => Object.assign(q, { op: "insert", body }) && builder,
        upsert: (body) => Object.assign(q, { op: "upsert", body }) && builder,
        delete: () => Object.assign(q, { op: "delete" }) && builder,
        eq: (column, value) => q.filters.push(["eq", column, value]) && builder,
        gte: (column, value) =>
          q.filters.push(["gte", column, value]) && builder,
        in: (column, value) => q.filters.push(["in", column, value]) && builder,
        then: (resolve, reject) => {
          log.push(q)
          return Promise.resolve(respond(q)).then(resolve, reject)
        },
      }
      return builder
    },
  }
}

const product = (n, extra = {}) => ({
  id: id(n),
  name: `Product ${n}`,
  slug: `product-${n}`,
  ...basis,
  updated_at: AT,
  ...extra,
})

test("hiding many products writes each once, guarded by the revision read", async () => {
  const db = fakeDb([product(1), product(2)])
  const saved = await updateProducts(
    db,
    {
      products: [1, 2].map((n) => ({
        id: id(n),
        name: `Product ${n}`,
        // Another spelling of the same instant still matches.
        updated_at: "2030-01-01T00:00:00Z",
        changes: { status: "draft" },
      })),
    },
    fail
  )
  assert.deepEqual(
    saved.map(({ name, status }) => [name, status]),
    [
      ["Product 1", "draft"],
      ["Product 2", "draft"],
    ]
  )
  const updates = db.log.filter((q) => q.op === "update")
  assert.deepEqual(
    updates.map((q) => q.body),
    [{ status: "draft" }, { status: "draft" }]
  )
  for (const q of updates) assert(q.filters.some(([, c]) => c === "updated_at"))
  // No photos given, no photo rows touched.
  assert(!db.log.some((q) => q.table === "product_images"))
})

test("a product changed since it was read stops the whole proposal", async () => {
  const db = fakeDb([
    product(1),
    product(2, { updated_at: "2030-01-05T00:00:00+00:00" }),
  ])
  await assert.rejects(
    updateProducts(
      db,
      {
        products: [1, 2].map((n) => ({
          id: id(n),
          name: `Product ${n}`,
          updated_at: AT,
          changes: { status: "draft" },
        })),
      },
      fail
    ),
    /“Product 2” changed since you read it\. Nothing was saved/
  )
  assert(!db.log.some((q) => q.op === "update"))
  // Postgres keeps microseconds; a write in the same millisecond still counts.
  const close = fakeDb([
    product(4, { updated_at: "2030-01-01T00:00:00.000500+00:00" }),
  ])
  await assert.rejects(
    updateProducts(
      close,
      {
        products: [
          {
            id: id(4),
            name: "Close",
            updated_at: "2030-01-01T00:00:00.000100+00:00",
            changes: { status: "draft" },
          },
        ],
      },
      fail
    ),
    /changed since you read it/
  )
  await assert.rejects(
    updateProducts(
      fakeDb([]),
      {
        products: [
          {
            id: id(3),
            name: "Gone",
            updated_at: AT,
            changes: { status: "draft" },
          },
        ],
      },
      fail
    ),
    /“Gone” no longer exist/
  )
})

test("a failure part-way names what was saved", async () => {
  const db = fakeDb([product(1), product(2)], { failOn: id(2) })
  await assert.rejects(
    updateProducts(
      db,
      {
        products: [1, 2].map((n) => ({
          id: id(n),
          name: `Product ${n}`,
          updated_at: AT,
          changes: { price_cents: 50000 },
        })),
      },
      fail
    ),
    /^Error: Saved “Product 1”; then “Product 2”: a value breaks a rule/
  )
})

test("a new photo list rewrites the product's photos in order", async () => {
  const db = fakeDb([product(1)])
  await updateProducts(
    db,
    {
      products: [
        {
          id: id(1),
          name: "Product 1",
          updated_at: AT,
          changes: {
            images: [
              { path: "products/b.webp", alt: " Back ", width: 10, height: 10 },
              { path: "products/a.webp", alt: "Front", width: 10, height: 10 },
            ],
          },
        },
      ],
    },
    fail
  )
  const update = db.log.find((q) => q.op === "update")
  // Photos alone still mark the product as changed.
  assert.deepEqual(Object.keys(update.body), ["updated_at"])
  const upsert = db.log.find((q) => q.op === "upsert")
  assert.deepEqual(
    upsert.body.map(({ path, alt, sort_order }) => [path, alt, sort_order]),
    [
      ["products/b.webp", "Back", 0],
      ["products/a.webp", "Front", 1],
    ]
  )
  assert(
    db.log.some(
      (q) =>
        q.op === "delete" &&
        q.filters.some(([kind, , value]) => kind === "gte" && value === 2)
    )
  )
})

test("the product form saves only the fields the owner changed", async () => {
  const values = valuesFrom({
    id: id(1),
    slug: "product-1",
    name: "Product 1",
    category_slug: "speakers",
    condition: "New",
    status: "published",
    price_cents: 129900,
    short_description: "A line.",
    images: [{ path: "products/a.webp", alt: "Front", width: 10, height: 10 }],
  })
  const edited = { ...values, price: "1,199" }
  const input = inputFromValues(edited, values)
  const fields = changedInputFields(input, inputFromValues(values))
  assert.deepEqual(fields, ["price_cents"])

  const db = fakeDb([product(1)])
  await saveProduct(db, input, fail, new Set(fields))
  const update = db.log.find((q) => q.op === "update")
  assert.deepEqual(update.body, { price_cents: 119900 })
  assert(!db.log.some((q) => q.table === "product_images"))

  // A description is its three columns; a sale its columns and link.
  const copy = fakeDb([product(1)])
  await saveProduct(
    copy,
    { ...input, description: "New." },
    fail,
    new Set(["description"])
  )
  assert.deepEqual(
    Object.keys(copy.log.find((q) => q.op === "update").body).sort(),
    ["description_closing", "description_intro", "features"]
  )
})

test("a back order saves through the product editors and stays published", async () => {
  const row = product(1, { price_cents: 129900, short_description: "A line." })
  const values = valuesFrom(row)
  const input = productInputSchema.parse(
    inputFromValues({ ...values, availability: "back_order" }, values)
  )
  assert.equal(input.status, "published")
  assert.equal(createProductInputSchema.parse(input).availability, "back_order")
  const fields = changedInputFields(input, inputFromValues(values))
  assert.deepEqual(fields, ["availability"])

  const changes = { availability: "back_order" }
  const quick = productQuickEditSchema.parse({ id: row.id, ...changes })
  const proposal = updateProductsInputSchema.parse({
    products: [{ id: row.id, name: row.name, updated_at: AT, changes }],
  })
  for (const save of [
    (db) => saveProduct(db, input, fail, new Set(fields)),
    (db) => saveProductQuickEdits(db, [quick], fail),
    (db) => updateProducts(db, proposal, fail),
  ]) {
    const current = { ...row }
    await save(fakeDb([current]))
    assert.equal(current.availability, "back_order")
    assert.equal(current.status, "published")
    assert.equal(current.price_cents, 129900)
  }
})

test("an open form takes a newer save under the owner's own edits", () => {
  const base = valuesFrom({
    id: id(1),
    name: "Product 1",
    status: "published",
    price_cents: 129900,
  })
  // The owner changed the price; Tune hid the product meanwhile.
  const values = { ...base, price: "1199" }
  const latest = { ...base, status: "draft" }
  const rebased = rebaseValues(values, base, latest)
  assert.equal(rebased.status, "draft")
  assert.equal(rebased.price, "1199")
  // Saving then writes only the price, never the old status.
  assert.deepEqual(
    changedInputFields(
      inputFromValues(rebased, latest),
      inputFromValues(latest)
    ),
    ["price_cents"]
  )
})

test("a card shows text changes as what was removed and added", () => {
  const parts = (before, after) =>
    wordDiff(before, after).map(({ kind, text }) => `${kind}:${text}`)
  assert.deepEqual(
    parts("100Wpc power amplifier. $450", "100Wpc power amplifier."),
    ["same:100Wpc power amplifier.", "removed: $450"]
  )
  assert.deepEqual(parts("Compact amplifier, $300.", "Compact amplifier."), [
    "same:Compact amplifier",
    "removed:, $300",
    "same:.",
  ])
  assert.deepEqual(
    parts("Used (final sale) · 6 out of 10", "Used (final sale) · 8 out of 10"),
    ["same:Used (final sale) · ", "removed:6", "added:8", "same: out of 10"]
  )
  // A space between two changes joins them into one replacement.
  assert.deepEqual(parts("a big red car here", "a big blue van here"), [
    "same:a big ",
    "removed:red car",
    "added:blue van",
    "same: here",
  ])
  assert.deepEqual(parts("", "New line."), ["added:New line."])
  assert.deepEqual(parts("Same.", "Same."), ["same:Same."])
  // Very long rewrites are shown whole rather than word by word.
  const long = (word) => Array.from({ length: 800 }, () => word).join(" ")
  assert.deepEqual(
    wordDiff(long("a"), long("b")).map(({ kind }) => kind),
    ["removed", "added"]
  )
})
