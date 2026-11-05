import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

// The app's TypeScript imports its siblings without extensions; resolve
// those to .ts so Node can load (and strip types from) the real modules.
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

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co"
const lines = await import("../lib/admin/photo-lines.ts")
const { sentPhotos } = await import("../lib/admin/chat-photos.ts")
const { default: viewPhotos } = await import("../agent/tools/view_photos.ts")

const upload = "uploads/0b6f5a5e-1c2d-4e3f-8a9b-0c1d2e3f4a5b.webp"
const media = (path) =>
  `https://project.supabase.co/storage/v1/object/public/media/${path}`

test("photos ride on lines the chat writes and reads back", () => {
  const line = lines.photoLine({ path: upload, width: 1600, height: 1200 })
  assert.equal(line, `Photo uploaded: ${upload} (1600×1200)`)
  const text = `Put this on Instagram\n${line}\nPhoto uploaded: uploads/abc.jpg (800×600)`
  assert.deepEqual(lines.photoLines(text), [
    { path: upload, width: 1600, height: 1200 },
    { path: "uploads/abc.jpg", width: 800, height: 600 },
  ])
  // Only the composer's own lines: other folders, or a line in a sentence.
  assert.deepEqual(
    lines.photoLines(
      "Photo uploaded: products/x.webp (1×1)\nsee Photo uploaded: uploads/a.webp (1×1)"
    ),
    []
  )
})

test("the bubble shows the photos its lines name, or older file parts", () => {
  const owner = (parts) => ({ id: "m", role: "user", parts })
  assert.deepEqual(
    sentPhotos(
      owner([
        {
          type: "text",
          text: `Hi\n${lines.photoLine({ path: upload, width: 2, height: 1 })}`,
        },
      ])
    ),
    [media(upload)]
  )
  // An older chat sent eve attachments: those show, not the lines too.
  assert.deepEqual(
    sentPhotos(
      owner([
        { type: "text", text: `Photo uploaded: ${upload} (2×1)` },
        { type: "file", url: "https://cdn/x.webp", mediaType: "image/webp" },
      ])
    ),
    ["https://cdn/x.webp"]
  )
  assert.deepEqual(sentPhotos(owner([{ type: "text", text: "Hi" }])), [])
})

test("the model is told to look at the photos a message attaches", () => {
  assert.equal(lines.photoContext([]), null)
  const one = lines.photoContext([{ path: upload, width: 1, height: 1 }])
  assert.match(one, /attached a photo to this message: uploads\//)
  assert.match(one, /call view_photos with that path/)
  assert.match(
    lines.photoContext([
      { path: "uploads/a.webp", width: 1, height: 1 },
      { path: "uploads/b.webp", width: 1, height: 1 },
    ]),
    /2 photos .*uploads\/a\.webp, uploads\/b\.webp.*those paths/
  )
})

test("view_photos opens only media photos", () => {
  for (const path of [
    upload,
    "products/orbit-front.webp",
    "news/cover.jpg",
    "instagram/a.jpeg",
  ])
    assert.equal(lines.isViewablePath(path), true, path)
  for (const path of [
    "brands/logo.png",
    "uploads/../secret.webp",
    "/uploads/a.webp",
    "uploads/a.pdf",
    "https://example.com/a.webp",
    "uploads",
  ])
    assert.equal(lines.isViewablePath(path), false, path)
})

test("view_photos hands the model public URLs, checked first", async (t) => {
  const asked = []
  t.mock.method(globalThis, "fetch", async (url, init) => {
    asked.push([String(url), init.method])
    if (String(url).includes("missing"))
      return new Response(null, { status: 400 })
    if (String(url).includes("text")) {
      return new Response(null, { headers: { "content-type": "text/plain" } })
    }
    return new Response(null, {
      headers: { "content-type": "image/webp; charset=binary" },
    })
  })
  const output = await viewPhotos.execute(
    {
      paths: [upload, upload, "products/missing.webp", "news/text.webp"],
    },
    {}
  )
  // One HEAD per distinct photo; nothing downloaded or copied.
  assert.deepEqual(
    asked.map(([, method]) => method),
    ["HEAD", "HEAD", "HEAD"]
  )
  assert.deepEqual(output.photos, [
    { path: upload, url: media(upload), mediaType: "image/webp" },
  ])
  assert.deepEqual(
    output.missing.map((item) => item.path),
    ["products/missing.webp", "news/text.webp"]
  )
  const model = viewPhotos.toModelOutput(output)
  assert.equal(model.type, "content")
  assert.deepEqual(model.value[1], {
    type: "file",
    data: { type: "url", url: media(upload) },
    mediaType: "image/webp",
    filename: upload.split("/").pop(),
  })
  assert.match(model.value.at(-1).text, /news\/text\.webp isn't a photo/)

  // A host that can't be reached reads as a note, not a failed call.
  t.mock.method(globalThis, "fetch", async () => {
    throw new TypeError("fetch failed")
  })
  const offline = await viewPhotos.execute({ paths: [upload] }, {})
  assert.deepEqual(offline.photos, [])
  assert.match(offline.missing[0].problem, /couldn't be reached/)
})
