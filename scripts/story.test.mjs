import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import sharp from "sharp"

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

const story = await import("../lib/admin/story-images.ts")
const { BRAND_LOGO_PNG } = await import("../agent/lib/brand-logo.ts")
const { fitStoryFrame } = await import("../agent/lib/story-frame.ts")

const input = {
  brief: 'Headline "25% off Paradigm Monitor SE". Until January 4.',
  photos: ["uploads/promo.webp", "products/monitor-se.webp"],
  address: true,
}
const url = (path) => `https://media.example/${path}`

test("every story asks for one 9:16 JPEG design with the logo first", () => {
  const body = story.storyRequest(input, BRAND_LOGO_PNG, url)
  assert.equal(body.model, "openai/gpt-image-2.6-flare")
  assert.equal(body.aspect_ratio, "9:16")
  assert.equal(body.output_format, "jpeg")
  assert.equal(body.quality, "high")
  assert.equal(body.background, "auto")
  assert.equal(body.n, 1)
  assert.deepEqual(
    body.input_references.map((item) => item.type),
    ["image_url", "image_url", "image_url"]
  )
  assert.equal(body.input_references[0].image_url.url, BRAND_LOGO_PNG)
  assert.match(BRAND_LOGO_PNG, /^data:image\/png;base64,iVBORw0KGgo/)
  assert.deepEqual(
    body.input_references.slice(1).map((item) => item.image_url.url),
    [url("uploads/promo.webp"), url("products/monitor-se.webp")]
  )
  // Only the parameters the model takes.
  assert.deepEqual(Object.keys(body).sort(), [
    "aspect_ratio",
    "background",
    "input_references",
    "model",
    "n",
    "output_format",
    "prompt",
    "quality",
  ])
})

test("the prompt keeps the brief inside the brand's rules", () => {
  const prompt = story.storyPrompt(input)
  assert.match(prompt, /full-screen Instagram story for Q Audio/)
  assert.ok(prompt.includes(input.brief))
  assert.match(prompt, /first reference image is the Q Audio logo/)
  assert.match(prompt, /5 Brookline Street, Cambridge, MA/)
  // Instagram's own frame, and its safe zone (Moonb's 2026 story specs).
  assert.match(prompt, /9:16 canvas, 1080 × 1920 pixels/)
  assert.match(prompt, /top 250 pixels \(13%/)
  assert.match(prompt, /bottom 340 pixels \(18%: the "Send message" bar/)
  assert.match(prompt, /band from 250 to 1580 pixels down, at least 64 pixels/)
  // References are material, recomposed for the tall frame, never cropped.
  assert.match(prompt, /source material, not the layout/)
  assert.match(prompt, /show it whole, scaled down to fit inside the safe zone/)
  assert.match(prompt, /Keep every product exactly/)
  const plain = story.storyPrompt({ ...input, photos: [], address: false })
  assert.doesNotMatch(plain, /Brookline/)
  assert.doesNotMatch(plain, /Keep every product exactly/)
})

test("reference photos are media photos only, each once, six at most", () => {
  assert.deepEqual(
    story.storyPhotos([
      "uploads/a.webp",
      "uploads/a.webp",
      "brands/logo.png",
      "https://example.com/x.jpg",
      ...Array.from({ length: 8 }, (_, i) => `products/p${i}.webp`),
    ]),
    [
      "uploads/a.webp",
      ...Array.from({ length: 5 }, (_, i) => `products/p${i}.webp`),
    ]
  )
})

test("image sizes are read from PNG, JPEG, and WebP headers", async () => {
  const base = sharp({
    create: { width: 90, height: 160, channels: 3, background: "#808080" },
  })
  for (const format of ["png", "jpeg", "webp"]) {
    const bytes = await base.clone()[format]().toBuffer()
    assert.deepEqual(story.imageSize(bytes), { width: 90, height: 160 }, format)
  }
  const lossless = await base.clone().webp({ lossless: true }).toBuffer()
  assert.deepEqual(story.imageSize(lossless), { width: 90, height: 160 })
  const alpha = await sharp({
    create: { width: 90, height: 160, channels: 4, background: "#0000" },
  })
    .webp()
    .toBuffer()
  assert.deepEqual(story.imageSize(alpha), { width: 90, height: 160 })
  assert.equal(story.imageSize(new Uint8Array([1, 2, 3])), null)
})

test("the reply's designs are decoded; anything else is left out", async () => {
  const jpeg = await sharp({
    create: { width: 72, height: 128, channels: 3, background: "#222" },
  })
    .jpeg()
    .toBuffer()
  const { images, cost } = story.readStoryReply({
    data: [
      { b64_json: jpeg.toString("base64"), media_type: "image/jpeg" },
      { b64_json: "bm90IGFuIGltYWdl", media_type: "image/jpeg" },
      { url: "https://example.com/x.png" },
      { b64_json: jpeg.toString("base64"), media_type: "image/heic" },
    ],
    usage: { cost: 0.21 },
  })
  assert.equal(images.length, 1)
  assert.equal(images[0].extension, "jpg")
  assert.equal(images[0].width, 72)
  assert.equal(images[0].height, 128)
  assert.equal(cost, 0.21)
  assert.deepEqual(story.readStoryReply(null), { images: [], cost: null })
})

test("requests never throw, and failures are worded for the owner", async () => {
  const body = story.storyRequest(input, BRAND_LOGO_PNG, url)
  const jpeg = await sharp({
    create: { width: 9, height: 16, channels: 3, background: "#fff" },
  })
    .jpeg()
    .toBuffer()
  let sent
  const ok = await story.requestStoryImages(
    body,
    "key",
    async (target, init) => {
      sent = { target, init }
      return Response.json({
        data: [
          { b64_json: jpeg.toString("base64"), media_type: "image/jpeg" },
          { b64_json: jpeg.toString("base64"), media_type: "image/jpeg" },
        ],
        usage: { cost: 0.4 },
      })
    }
  )
  assert.equal(ok.images.length, 2)
  assert.equal(sent.target, "https://openrouter.ai/api/v1/images")
  assert.equal(sent.init.headers.Authorization, "Bearer key")
  assert.deepEqual(JSON.parse(sent.init.body), body)

  assert.match(
    (await story.requestStoryImages(body, undefined)).problem,
    /OPENROUTER_API_KEY/
  )
  const secret = "sk-or-secret-provider-detail"
  for (const [status, pattern] of [
    [402, /out of credits/],
    [401, /OPENROUTER_API_KEY/],
    [429, /busy/],
    [400, /change the brief/],
    [502, /nothing was charged/],
  ]) {
    const result = await story.requestStoryImages(body, "key", async () =>
      Response.json({ error: { message: secret } }, { status })
    )
    assert.match(result.problem, pattern)
    assert.ok(!result.problem.includes(secret))
  }
  const offline = await story.requestStoryImages(body, "key", async () => {
    throw new TypeError("fetch failed")
  })
  assert.match(offline.problem, /Couldn't reach/)
  const empty = await story.requestStoryImages(body, "key", async () =>
    Response.json({ data: [] })
  )
  assert.match(empty.problem, /no design/)
})

test("the chat's progress estimate climbs and never claims done", () => {
  assert.equal(story.storyProgress(0), 0)
  assert.equal(story.storyProgress(-5), 0)
  const steps = [5, 20, 45, 90, 600].map(story.storyProgress)
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] >= steps[i - 1])
  assert.ok(steps[2] > 0.8 && steps[2] < 0.97)
  assert.equal(steps.at(-1), 0.97)
})

test("the frame fitter produces full-bleed JPEGs and refuses to manufacture padding bands", async () => {
  const image = (width, height) =>
    sharp({ create: { width, height, channels: 3, background: "#c0c0c0" } })
      .png()
      .toBuffer()
  for (const [width, height] of [
    [1080, 1920],
    [1088, 1920],
  ]) {
    const source = await image(width, height)
    const fitted = await fitStoryFrame(source)
    const meta = await sharp(fitted.bytes).metadata()
    assert.deepEqual(
      [meta.width, meta.height, meta.format, meta.space],
      [1080, 1920, "jpeg", "srgb"]
    )
    const { data } = await sharp(fitted.bytes)
      .extract({ left: 0, top: 0, width: 1, height: 1 })
      .raw()
      .toBuffer({ resolveWithObject: true })
    assert.ok([...data].every((value) => Math.abs(value - 192) < 12))
  }
  for (const [width, height] of [
    [1024, 1024],
    [1024, 1536],
    [600, 1600],
  ]) {
    assert.equal(story.storyNeedsBackground(width, height), true)
    await assert.rejects(
      fitStoryFrame(await image(width, height)),
      /background extended/
    )
  }
  assert.equal(story.storyNeedsBackground(1080, 1920), false)
})
