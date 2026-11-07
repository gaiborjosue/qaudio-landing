import assert from "node:assert/strict"
import test from "node:test"
import sharp from "sharp"
import {
  derivative,
  immutablePath,
  legacyOriginal,
  sha,
} from "./webflow/rescue.mjs"

test("originals remain unchanged, derivatives fit bucket and preserve alpha/color", async () => {
  const input = await sharp({
    create: {
      width: 2400,
      height: 20,
      channels: 4,
      background: { r: 211, g: 40, b: 33, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer()
  const before = sha(input)
  const output = await derivative(input)
  assert.equal(sha(input), before)
  assert.equal(output.width, 2200)
  const meta = await sharp(output.bytes).metadata()
  assert.equal(meta.format, "webp")
  assert.equal(meta.hasAlpha, true)
  const { data } = await sharp(output.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  assert(data[0] > 150 && data[1] < 80 && data[3] > 100 && data[3] < 160)
})
test("SVG content is rasterized with original provenance, opaque logo fits light-on-black", async () => {
  const input = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect x="20" y="10" width="80" height="20" fill="black"/></svg>'
  )
  const output = await derivative(input, true)
  assert.equal(output.original.format, "svg")
  assert.equal(output.original.hasAlpha, true)
  const stats = await sharp(output.bytes).stats()
  assert(stats.channels[0].max > 240)
})

test("opaque light logo grounds invert to black just as Metadata uploads do", async () => {
  const input = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><rect width="100" height="40" fill="white"/><rect x="30" y="10" width="40" height="20" fill="black"/></svg>'
  )
  const result = await derivative(input, true)
  const { data, info } = await sharp(result.bytes)
    .raw()
    .toBuffer({ resolveWithObject: true })
  assert(data[0] < 10)
  assert(data[(20 * info.width + 50) * info.channels] > 240)
})
test("animated GIF keeps all frames in an animated WebP", async () => {
  const input = await sharp({
    create: { width: 4, height: 8, channels: 4, background: "red" },
    pageHeight: 4,
  })
    .gif()
    .toBuffer()
  // Real two-frame fixture assembled without a binary fixture in the repo.
  const raw = Buffer.concat([
    Buffer.alloc(4 * 4 * 4, 255),
    Buffer.alloc(4 * 4 * 4, 100),
  ])
  const gif = await sharp(raw, {
    raw: { width: 4, height: 8, channels: 4, pageHeight: 4 },
  })
    .gif({ delay: [100, 200], loop: 0 })
    .toBuffer()
  const result = await derivative(gif)
  assert.equal(result.original.pages, 2)
  assert.equal(
    (await sharp(result.bytes, { animated: true }).metadata()).pages,
    2
  )
  assert(input.length > 0)
})
test("immutable names use actual bytes, legacy retry changes only embedded asset filename", () => {
  const hash = sha(Buffer.from("asset"))
  assert.match(immutablePath("brands", hash), /^brands\/[a-f0-9-]{36}\.webp$/)
  assert.equal(immutablePath("products", hash), `products/webflow-${hash}.webp`)
  assert.equal(
    legacyOriginal(
      "https://cdn.prod.website-files.com/site/aaaaaaaaaaaaaaaaaaaaaaaa_bbbbbbbbbbbbbbbbbbbbbbbb_rear.png"
    ),
    "https://cdn.prod.website-files.com/site/bbbbbbbbbbbbbbbbbbbbbbbb_rear.png"
  )
  assert.equal(
    legacyOriginal("https://cdn.prod.website-files.com/site/single.png"),
    null
  )
})
