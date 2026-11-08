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
        then(resolve, reject) {
          calls.push(request)
          let result
          if (table === "deals" && request.op !== "select") {
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
