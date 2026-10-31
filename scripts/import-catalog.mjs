// Upload versioned product photos and upsert the reviewed seed. This resets
// seeded product fields, but never deletes other products. Run on a trusted host.
import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY
if (!url || !key)
  throw new Error(
    "Set the Supabase URL and server-only secret key in .env.local."
  )
const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const seedDir = new URL("../supabase/seed/", import.meta.url)
const products = JSON.parse(
  await readFile(new URL("catalog.json", seedDir), "utf8")
)
for (const { images, ...product } of products) {
  for (const image of images) {
    const { error } = await supabase.storage
      .from("media")
      .upload(image.path, await readFile(new URL(image.path, seedDir)), {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: true,
      })
    if (error) throw new Error(`Upload ${image.path}: ${error.message}`)
  }
  const { data, error } = await supabase
    .from("products")
    .upsert(product, { onConflict: "slug" })
    .select("id")
    .single()
  if (error) throw new Error(`Product ${product.slug}: ${error.message}`)
  const { error: imageError } = await supabase.from("product_images").upsert(
    images.map((image) => ({ ...image, product_id: data.id })),
    { onConflict: "product_id,sort_order" }
  )
  if (imageError) throw new Error(`Product images: ${imageError.message}`)
  console.log(`Imported ${product.slug}: ${images.length} images`)
}
