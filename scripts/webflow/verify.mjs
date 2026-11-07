// Read-only proof of the applied CMS migration, saved on the rescue SSD.
import assert from "node:assert/strict"
import { readFile, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"

const run = resolve(process.argv[2] ?? "")
if (!run.startsWith("/Volumes/Edzio SSD/qaudioAssets/"))
  throw Error("Use migration SSD")
const read = async (name) => JSON.parse(await readFile(join(run, name), "utf8"))
const before = await read("snapshot.json"),
  ops = await read("operations.json"),
  paths = await read("upload-paths.json")
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
if (new URL(url).hostname !== "kemumhpxapfadqsytudt.supabase.co")
  throw Error("Wrong project")
const db = createClient(url, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const after = {
  project: before.project,
  captured_at: new Date().toISOString(),
  tables: {},
}
for (const table of [...Object.keys(before.tables), "webflow_import_records"]) {
  const rows = []
  const order =
    table === "webflow_import_records"
      ? "item_id"
      : table === "media_references"
        ? "source"
        : table === "media_assets"
          ? "path"
          : table.startsWith("catalog_")
            ? "slug"
            : "id"
  for (let offset = 0; ; offset += 1000) {
    const result = await db
      .from(table)
      .select("*")
      .order(order)
      .range(offset, offset + 999)
    if (result.error) throw Error(`Verification ${table}: ${result.error.code}`)
    rows.push(...result.data)
    if (result.data.length < 1000) break
  }
  after.tables[table] = rows
}
const equalFields = (actual, expected, omit = []) => {
  assert(actual, "Missing preserved row")
  for (const [key, value] of Object.entries(expected))
    if (!omit.includes(key))
      assert.deepEqual(
        actual[key],
        value,
        `Preserved ${expected.slug ?? expected.id}: ${key}`
      )
}
for (const table of [
  "products",
  "news_posts",
  "catalog_categories",
  "deal_items",
]) {
  for (const row of before.tables[table])
    equalFields(
      after.tables[table].find((r) =>
        r.id ? r.id === row.id : r.slug === row.slug
      ),
      row
    )
}
for (const row of before.tables.product_images)
  equalFields(
    after.tables.product_images.find((r) => r.id === row.id),
    row
  )
for (const row of before.tables.catalog_brands)
  equalFields(
    after.tables.catalog_brands.find((r) => r.slug === row.slug),
    row
  )
const closeout = before.tables.deals[0]
const currentCloseout = after.tables.deals.find((r) => r.id === closeout.id)
equalFields(currentCloseout, closeout, ["status", "updated_at"])
assert.equal(currentCloseout.status, "draft")
for (const rec of ops) {
  if (rec.mode !== "insert") continue
  const row = after.tables[rec.table].find((r) =>
    r.slug ? r.slug === rec.key : r.id === rec.key
  )
  equalFields(row, rec.fields)
  if (rec.table === "products") {
    const photos = after.tables.product_images
      .filter((r) => r.product_id === row.id)
      .sort((a, b) => a.sort_order - b.sort_order)
    assert.equal(photos.length, rec.children.length)
    rec.children.forEach((photo, i) => equalFields(photos[i], photo))
  }
}
assert.equal(after.tables.products.length, 206)
assert.equal(
  after.tables.news_posts.filter((r) => r.status === "published").length,
  10
)
assert.equal(after.tables.news_posts.length, 11)
assert.equal(after.tables.catalog_brands.filter((r) => r.featured).length, 20)
assert.equal(
  after.tables.products.filter((r) => r.brand_slug === null).length,
  5
)
const sold = after.tables.products.find((r) => r.slug === "b-w-607s2")
assert.equal(sold.price_cents, null)
assert.equal(sold.availability, "sold")
const special = after.tables.products.find((r) => r.slug === "grado-sr125x")
assert.equal(special.price_cents, 100)
assert.equal(special.msrp_cents, 17500)
for (const path of paths) {
  const asset = after.tables.media_assets.find(
    (r) => r.bucket_id === "media" && r.path === path
  )
  assert(asset, `Media inventory missing ${path}`)
  assert.equal(asset.managed, false)
  assert.equal(asset.state, "ready")
  assert(
    after.tables.media_references.some(
      (r) => r.bucket_id === "media" && r.path === path
    ),
    `Unreferenced migration file ${path}`
  )
}
for (const table of [
  "products",
  "news_posts",
  "catalog_categories",
  "catalog_brands",
  "product_images",
  "deals",
]) {
  assert(
    !/https?:[^"\s]*(?:website-files\.com|webflow\.com|cloudfront\.net)/.test(
      JSON.stringify(after.tables[table])
    ),
    `Webflow URL remains in ${table}`
  )
}
assert.equal(after.tables.webflow_import_records.length, ops.length)
const summary = {
  captured_at: after.captured_at,
  counts: Object.fromEntries(
    Object.entries(after.tables).map(([table, rows]) => [table, rows.length])
  ),
  source_products: 206,
  live_source_news: 10,
  preserved_news_and_draft: before.tables.news_posts.length,
  preserved_products: 2,
  featured_brands: 20,
  null_brands: 5,
  verified_unmanaged_referenced_files: paths.length,
  webflow_rendering_urls: 0,
  all_checks_passed: true,
}
await writeFile(
  join(run, "post-apply-snapshot.json"),
  JSON.stringify(after, null, 2)
)
await writeFile(
  join(run, "verification.json"),
  JSON.stringify(summary, null, 2)
)
console.log(JSON.stringify(summary))
