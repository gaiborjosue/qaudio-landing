// Trusted-host stage 2 only. Never invoked by plan/rescue/prepare.
import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { createClient } from "@supabase/supabase-js"
import { sha } from "./rescue.mjs"

const run = resolve(process.argv[2] ?? "")
if (!run.startsWith("/Volumes/Edzio SSD/qaudioAssets/"))
  throw Error("Use the migration SSD")
const manifest = JSON.parse(
  await readFile(join(run, "asset-manifest.json"), "utf8")
)
const paths = JSON.parse(await readFile(join(run, "upload-paths.json"), "utf8"))
const review = JSON.parse(await readFile(join(run, "review.json"), "utf8"))
if (
  review.unresolved_required_assets.length ||
  manifest.some((a) => a.status !== "verified")
)
  throw Error("Resolve every required asset before uploading")
const chosen = paths.map((path) => {
  const asset = manifest.find((a) => a.derivative.storage_paths.includes(path))
  if (!asset) throw Error("Upload path is absent from the manifest")
  return { path, ...asset.derivative }
})
for (const item of chosen) {
  if (sha(await readFile(join(run, item.local))) !== item.sha256)
    throw Error("Local derivative checksum changed")
}
if (!process.argv.includes("--apply-upload")) {
  console.log(
    `Validated ${chosen.length} immutable upload paths. No remote writes. Stage 2 requires --apply-upload.`
  )
} else {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (new URL(url).hostname !== "kemumhpxapfadqsytudt.supabase.co")
    throw Error("Wrong project")
  const db = createClient(url, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  let uploaded = 0,
    reused = 0
  for (const item of chosen) {
    // Check exact bytes before reusing any pre-existing immutable object.
    const existing = await db.storage.from("media").download(item.path)
    if (existing.data) {
      if (sha(Buffer.from(await existing.data.arrayBuffer())) !== item.sha256)
        throw Error("Immutable Storage path conflicts with manifest")
      reused++
      continue
    }
    if (
      !existing.error ||
      !["400", "404"].includes(String(existing.error.statusCode))
    )
      throw Error("Cannot verify existing Storage object")
    const result = await db.storage
      .from("media")
      .upload(item.path, await readFile(join(run, item.local)), {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      })
    if (result.error)
      throw Error(
        `Immutable upload failed: ${result.error.statusCode ?? "unavailable"}`
      )
    const verify = await db.storage.from("media").download(item.path)
    if (
      !verify.data ||
      sha(Buffer.from(await verify.data.arrayBuffer())) !== item.sha256
    )
      throw Error("Uploaded object did not verify")
    uploaded++
    if ((uploaded + reused) % 40 === 0)
      console.log(
        `Verified ${uploaded + reused}/${chosen.length} uploaded or reused objects`
      )
  }
  console.log(JSON.stringify({ uploaded, reused }))
}
