// Local downloads/derivatives only. No Storage writes. Resume uses verified receipts.
import { readFile, writeFile, mkdir, access } from "node:fs/promises"
import { join, resolve } from "node:path"
import { createHash } from "node:crypto"
import sharp from "sharp"
import { logoTone } from "../../lib/admin/logo-tone.ts"

export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
export function immutablePath(folder, hash) {
  // Artwork's existing UUID filename contract; content-derived, never random/overwritten.
  const name =
    folder === "brands"
      ? `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`
      : `webflow-${hash}`
  return `${folder}/${name}.webp`
}

export async function derivative(bytes, logo = false) {
  const meta = await sharp(bytes, {
    animated: true,
    limitInputPixels: 100e6,
  }).metadata()
  if (!["jpeg", "png", "webp", "avif", "gif", "svg"].includes(meta.format))
    throw Error("Unsupported image format")
  let pipeline = sharp(bytes, { animated: true, limitInputPixels: 100e6 })
    .rotate()
    .resize({
      width: 2200,
      height: 2200,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
  if (logo) {
    // Use the same light-on-black contract as Metadata. Preserve originals unchanged.
    const sample = await sharp(bytes)
      .resize({ width: 128, height: 128, fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const dark =
      logoTone(sample.data, sample.info.width, sample.info.height) === "dark"
    pipeline = pipeline.grayscale()
    if (dark) pipeline = pipeline.negate({ alpha: false })
    pipeline = pipeline.flatten({ background: "#000000" })
  }
  const out = await pipeline
    .webp({ quality: 88, effort: 5, loop: meta.loop })
    .toBuffer({ resolveWithObject: true })
  if (out.data.length > 10 * 1024 * 1024)
    throw Error("Derivative exceeds bucket 10MB limit")
  return {
    bytes: out.data,
    original: {
      format: meta.format,
      width: meta.width,
      height: meta.pageHeight ?? meta.height,
      pages: meta.pages ?? 1,
      hasAlpha: meta.hasAlpha,
      bytes: bytes.length,
    },
    width: out.info.width,
    height: out.info.pageHeight ?? out.info.height,
    pages: out.info.pages ?? 1,
  }
}

async function download(url) {
  const u = new URL(url)
  if (
    u.protocol !== "https:" ||
    ![
      "cdn.prod.website-files.com",
      "assets.website-files.com",
      "uploads-ssl.webflow.com",
      "uploads.webflow.com",
      "kemumhpxapfadqsytudt.supabase.co",
    ].includes(u.hostname)
  )
    throw Error("Unapproved asset host")
  let last
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(45000),
        redirect: "error",
      })
      if (!response.ok) throw Error(`HTTP ${response.status}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.length > 60e6) throw Error("Source exceeds rescue size bound")
      return bytes
    } catch (error) {
      last = error
      if (attempt < 2)
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)))
    }
  }
  throw last
}

export function legacyOriginal(url) {
  // Webflow's collection migration sometimes prepended a new asset id to an
  // existing original filename, leaving a dead URL. Only retry that exact
  // embedded original id/filename, same host and collection. Receipt records it.
  const u = new URL(url)
  const path = u.pathname.replace(/\/[a-f0-9]{24}_([a-f0-9]{24}_[^/]+)$/, "/$1")
  if (path === u.pathname) return null
  u.pathname = path
  return u.href
}

async function main() {
  const run = resolve(process.argv[2] ?? "")
  if (!run.startsWith("/Volumes/Edzio SSD/qaudioAssets/"))
    throw Error("Use the migration SSD")
  const plan = JSON.parse(await readFile(join(run, "plan.json"), "utf8"))
  const snapshot = JSON.parse(
    await readFile(join(run, "snapshot.json"), "utf8")
  )
  for (const dir of ["originals", "derivatives", "receipts", "owned"])
    await mkdir(join(run, dir), { recursive: true })
  const results = []
  let index = 0
  const exists = async (p) => {
    try {
      await access(p)
      return true
    } catch {
      return false
    }
  }
  async function item(asset) {
    const receiptPath = join(run, "receipts", sha(asset.url) + ".json")
    if (await exists(receiptPath)) {
      const old = JSON.parse(await readFile(receiptPath, "utf8"))
      if (
        old.status === "verified" &&
        (!asset.uses.every((use) => use.folder === "brands") ||
          old.derivative.recipe === "logo-v2") &&
        sha(await readFile(join(run, old.original.local))) ===
          old.original.sha256 &&
        sha(await readFile(join(run, old.derivative.local))) ===
          old.derivative.sha256
      )
        return { ...old, uses: asset.uses, source_urls: asset.source_urls }
    }
    try {
      let bytes, recovered_url
      try {
        bytes = await download(asset.url)
      } catch (error) {
        const candidates = [
          ...new Set(
            [
              ...(asset.export_original_candidates ?? []),
              legacyOriginal(asset.url),
              // Historical Webflow originals use .jpg while copied rich-text
              // references were renamed .jpeg. Keep original id and basename.
              legacyOriginal(asset.url)?.replace(/\.jpeg$/, ".jpg"),
            ].filter(Boolean)
          ),
        ]
        if (!candidates.length) throw error
        let recovered = false
        for (const original of candidates) {
          try {
            bytes = await download(original)
            recovered_url = original
            recovered = true
            break
          } catch {}
        }
        if (!recovered) throw error
      }
      const result = await derivative(
        bytes,
        asset.uses.every((u) => u.folder === "brands")
      )
      const hash = sha(bytes)
      const outHash = sha(result.bytes)
      const original = `originals/${hash}.${result.original.format}`
      const out = `derivatives/${outHash}.webp`
      for (const [path, data] of [
        [original, bytes],
        [out, result.bytes],
      ]) {
        if (await exists(join(run, path))) {
          if (sha(await readFile(join(run, path))) !== sha(data))
            throw Error("Content-addressed archive corruption")
        } else await writeFile(join(run, path), data, { flag: "wx" })
      }
      const receipt = {
        ...asset,
        status: "verified",
        ...(recovered_url && { recovered_url }),
        original: { ...result.original, sha256: hash, local: original },
        derivative: {
          recipe: asset.uses.every((use) => use.folder === "brands")
            ? "logo-v2"
            : "photo-v1",
          sha256: outHash,
          local: out,
          bytes: result.bytes.length,
          width: result.width,
          height: result.height,
          pages: result.pages,
          storage_paths: [
            ...new Set(asset.uses.map((u) => immutablePath(u.folder, outHash))),
          ],
        },
      }
      await writeFile(receiptPath, JSON.stringify(receipt, null, 2))
      return receipt
    } catch (error) {
      const receipt = { ...asset, status: "failed", error: error.message }
      await writeFile(receiptPath, JSON.stringify(receipt, null, 2))
      return receipt
    }
  }
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      while (index < plan.assets.length) {
        const asset = plan.assets[index++]
        results.push(await item(asset))
        if (results.length % 40 === 0)
          console.log(
            `Verified ${results.filter((r) => r.status === "verified").length}/${plan.assets.length}`
          )
      }
    })
  )
  results.sort((a, b) => a.url.localeCompare(b.url))
  await writeFile(
    join(run, "asset-manifest.json"),
    JSON.stringify(results, null, 2)
  )
  // Recover current curated rendering assets too, without changing their identity.
  const paths = new Set()
  for (const table of [
    "catalog_categories",
    "catalog_brands",
    "product_images",
    "news_posts",
  ])
    for (const row of snapshot.tables[table]) {
      for (const key of [
        "artwork_path",
        "scene_path",
        "logo_path",
        "path",
        "cover_path",
      ])
        if (row[key]) paths.add(row[key])
      if (table === "news_posts")
        for (const block of row.body)
          if (block.type === "image") paths.add(block.image.src)
    }
  const owned = []
  for (const path of paths) {
    try {
      const bytes = path.startsWith("/")
        ? await readFile(join(process.cwd(), "public", path.slice(1)))
        : await download(
            `https://kemumhpxapfadqsytudt.supabase.co/storage/v1/object/public/media/${path}`
          )
      const meta = await sharp(bytes, { animated: true }).metadata()
      const local = `owned/${sha(bytes)}.${meta.format}`
      if (!(await exists(join(run, local))))
        await writeFile(join(run, local), bytes, { flag: "wx" })
      owned.push({
        path,
        local,
        sha256: sha(bytes),
        bytes: bytes.length,
        width: meta.width,
        height: meta.height,
        status: "verified",
      })
    } catch (error) {
      owned.push({ path, status: "failed", error: error.message })
    }
  }
  await writeFile(
    join(run, "owned-manifest.json"),
    JSON.stringify(owned, null, 2)
  )
  const verified = results.filter((r) => r.status === "verified")
  const summary = {
    urls: results.length,
    verified: verified.length,
    failed: results.filter((r) => r.status !== "verified").length,
    unique_originals: new Set(verified.map((r) => r.original.sha256)).size,
    unique_derivatives: new Set(verified.map((r) => r.derivative.sha256)).size,
    original_bytes: [
      ...new Map(
        verified.map((r) => [r.original.sha256, r.original.bytes])
      ).values(),
    ].reduce((a, b) => a + b, 0),
    owned: owned.length,
    owned_failed: owned.filter((r) => r.status === "failed").length,
  }
  await writeFile(
    join(run, "asset-summary.json"),
    JSON.stringify(summary, null, 2)
  )
  console.log(JSON.stringify(summary))
  if (summary.failed || summary.owned_failed) process.exitCode = 1
}
if (process.argv[1] === new URL(import.meta.url).pathname) await main()
