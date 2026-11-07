// READ ONLY. Credentials never enter the snapshot or logs.
import { createClient } from "@supabase/supabase-js"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
const root = process.argv[2]
if (!root?.startsWith("/Volumes/Edzio SSD/qaudioAssets/"))
  throw Error("Snapshot must be on the migration SSD")
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
if (new URL(url).hostname !== "kemumhpxapfadqsytudt.supabase.co")
  throw Error("Wrong project")
const db = createClient(url, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const tables = [
  "catalog_categories",
  "catalog_brands",
  "products",
  "product_images",
  "news_posts",
  "deals",
  "deal_items",
  "media_assets",
  "media_references",
]
const snapshot = {
  project: "kemumhpxapfadqsytudt",
  captured_at: new Date().toISOString(),
  tables: {},
}
for (const table of tables) {
  const rows = []
  for (let offset = 0; ; offset += 1000) {
    const order =
      table === "media_references"
        ? "source"
        : table === "media_assets"
          ? "path"
          : table.startsWith("catalog_")
            ? "slug"
            : "id"
    const { data, error } = await db
      .from(table)
      .select("*")
      .order(order)
      .range(offset, offset + 999)
    if (error) throw Error(`Snapshot ${table}: ${error.code}`)
    rows.push(...data)
    if (data.length < 1000) break
  }
  snapshot.tables[table] = rows
}
await mkdir(root, { recursive: true })
await writeFile(
  join(root, "snapshot.json"),
  JSON.stringify(snapshot, null, 2),
  { flag: "wx" }
)
console.log(
  JSON.stringify(
    Object.fromEntries(
      Object.entries(snapshot.tables).map(([k, v]) => [k, v.length])
    )
  )
)
