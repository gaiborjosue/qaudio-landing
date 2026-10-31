// One-time import of the news posts migrated from qaudio.com into Supabase:
// uploads the photos in supabase/seed/news/ to the media bucket and upserts
// the posts in supabase/seed/news.json by slug. Safe to re-run.
//
//   pnpm import:news
//
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local.
import { readFile } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const secretKey = process.env.SUPABASE_SECRET_KEY
if (!url || !secretKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local."
  )
  process.exit(1)
}

const BUCKET = "media"
const seedDir = new URL("../supabase/seed/", import.meta.url)
const supabase = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const posts = JSON.parse(await readFile(new URL("news.json", seedDir), "utf8"))

const imagePaths = new Set()
for (const post of posts) {
  imagePaths.add(post.cover.path)
  for (const block of post.body) {
    if (block.type === "image") imagePaths.add(block.image.src)
  }
}

for (const path of imagePaths) {
  const file = await readFile(new URL(path, seedDir))
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "image/webp",
    // File names never change, so browsers and the CDN may keep them.
    cacheControl: "31536000",
    upsert: true,
  })
  if (error) throw new Error(`Upload ${path}: ${error.message}`)
  console.log(`uploaded ${BUCKET}/${path}`)
}

const rows = posts.map((post) => ({
  slug: post.slug,
  title: post.title,
  excerpt: post.excerpt,
  body: post.body,
  cover_path: post.cover.path,
  cover_width: post.cover.width,
  cover_height: post.cover.height,
  cover_alt: post.cover.alt,
  cover_fit: post.cover.fit,
  status: "published",
  published_at: post.published_at,
}))

const { data, error } = await supabase
  .from("news_posts")
  .upsert(rows, { onConflict: "slug" })
  .select("slug")
if (error) throw new Error(`Upsert posts: ${error.message}`)
console.log(`upserted ${data.length} posts`)
