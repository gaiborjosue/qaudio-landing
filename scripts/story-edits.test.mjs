import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import sharp from "sharp"

// Exercise the real paid-operation boundary with caller-session Storage fakes.
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith("/app/admin/image-edit-actions.ts")) {
      if (
        specifier === "@/lib/admin/auth" ||
        specifier === "@/lib/supabase/server"
      ) {
        const code =
          specifier === "@/lib/admin/auth"
            ? "export const getAdmin = () => globalThis.storyFixture.admin"
            : "export const sessionSupabase = () => globalThis.storyFixture.client"
        return {
          url: `data:text/javascript,${encodeURIComponent(code)}`,
          shortCircuit: true,
        }
      }
      if (specifier.startsWith("@/lib/")) {
        return {
          url: new URL(`../../${specifier.slice(2)}.ts`, context.parentURL)
            .href,
          shortCircuit: true,
        }
      }
    }
    if (
      specifier === "./supabase" &&
      /\/agent\/lib\/(story|media-session)\.ts$/.test(context.parentURL ?? "")
    ) {
      const code = `export const ACCESS_TOKEN_ATTRIBUTE = "supabaseAccessToken";
        export const callerSupabase = () => globalThis.storyFixture.client;
        export const verifyAdminToken = async () => { globalThis.storyFixture.checked++; return globalThis.storyFixture.admin; };`
      return {
        url: `data:text/javascript,${encodeURIComponent(code)}`,
        shortCircuit: true,
      }
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

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://media.example"
const edits = await import("../lib/admin/story-edits.ts")
const { applyImageEdit } = await import("../app/admin/image-edit-actions.ts")
const { editStory, designStory } = await import("../agent/lib/story.ts")
const { reviewStory } = await import("../agent/lib/story-review.ts")
const { default: designTool } = await import("../agent/tools/design_story.ts")
const { default: editTool } = await import("../agent/tools/edit_story.ts")
const source = "uploads/00000000-0000-4000-8000-000000000001.jpg"
const base = {
  image: source,
  instructions: "Make the background warmer.",
  regions: [],
  photos: [],
}
const url = (path) => `https://media.example/${path}`
const region = (operation, extra = {}) => ({
  operation,
  box: [100, 200, 400, 800],
  target: null,
  instruction: "",
  ...extra,
})

test("story review waits for Continue and passes whole-image or region feedback through without approving a post", async () => {
  let resolve
  let question
  const pending = reviewStory({
    ask: (input) => {
      question = input
      return new Promise((done) => {
        resolve = done
      })
    },
  })
  let settled = false
  pending.then(() => {
    settled = true
  })
  await Promise.resolve()
  assert.equal(settled, false)
  assert.equal(question.allowFreeform, true)
  assert.deepEqual(
    question.options.map((option) => [option.id, option.label]),
    [["continue", "Continue"]]
  )
  resolve({ status: "answered", optionId: "continue" })
  assert.deepEqual(await pending, { review: "continued" })
  for (const feedback of [
    "Make the headline smaller",
    'Story edit: {"image":"uploads/version.jpg","regions":[]}',
  ]) {
    assert.deepEqual(
      await reviewStory({
        ask: async () => ({ status: "answered", text: feedback }),
      }),
      { review: "changes_requested", feedback }
    )
  }
  for (const status of ["cancelled", "unavailable"])
    assert.deepEqual(await reviewStory({ ask: async () => ({ status }) }), {
      review: "interrupted",
    })
})

test("Continue with an earlier version returns that version as the design, and only a story frame from the chat's uploads", async () => {
  const versions = await import("../lib/admin/story-versions.ts")
  const earlier = {
    path: "uploads/chat/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002.jpg",
    width: 1080,
    height: 1920,
  }
  const text = versions.storyVersionText(2, earlier)
  assert.match(text, /^Continue with version 2\./)
  assert.deepEqual(
    await reviewStory({
      ask: async () => ({ status: "answered", optionId: "continue", text }),
    }),
    { review: "continued", design: earlier }
  )
  for (const foreign of [
    { ...earlier, path: "products/sample.jpg" },
    { ...earlier, path: earlier.path.replace(".jpg", ".webp") },
    { ...earlier, width: 1000 },
    { ...earlier, path: "uploads/chat/../products/x.jpg" },
  ]) {
    const answer = versions.storyVersionText(1, foreign)
    assert.equal(versions.readStoryVersion(answer), null)
    assert.deepEqual(
      await reviewStory({
        ask: async () => ({
          status: "answered",
          optionId: "continue",
          text: answer,
        }),
      }),
      { review: "continued" }
    )
  }
  assert.equal(versions.readStoryVersion("Story version: {not json"), null)
})

test("story versions count each edit on from the version it edited, across the chat", async () => {
  const { storyVersions } = await import("../lib/admin/story-versions.ts")
  const image = (n) => ({
    path: `uploads/v${n}.jpg`,
    width: 1080,
    height: 1920,
  })
  const found = storyVersions([
    { callId: "a", name: "design_story", output: { images: [image(1)] } },
    {
      callId: "b",
      name: "edit_story",
      input: { image: image(1).path },
      output: { images: [image(2)], design: image(2) },
    },
    // Still designing, then failed: no version.
    { callId: "c", name: "edit_story", input: { image: image(2).path } },
    // An edit of version 1 still counts on: version 3.
    {
      callId: "d",
      name: "edit_story",
      input: { image: image(1).path },
      // Continued with version 2: its own image stays version 3.
      output: { images: [image(3)], design: image(2), review: "continued" },
    },
    { callId: "e", name: "design_story", output: { images: [image(9)] } },
  ])
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(found).map(([id, item]) => [
        id,
        [
          item.version,
          item.latest,
          item.versions.map((version) => version.path),
        ],
      ])
    ),
    {
      a: [1, false, ["uploads/v1.jpg", "uploads/v2.jpg", "uploads/v3.jpg"]],
      b: [2, false, ["uploads/v1.jpg", "uploads/v2.jpg", "uploads/v3.jpg"]],
      d: [3, true, ["uploads/v1.jpg", "uploads/v2.jpg", "uploads/v3.jpg"]],
      e: [1, true, ["uploads/v9.jpg"]],
    }
  )
})

test("region geometry is independent of image scaling, with y before x", () => {
  for (const scale of [1, 0.5, 0.2]) {
    const a = edits.storyPoint(
      216 * scale,
      192 * scale,
      1080 * scale,
      1920 * scale
    )
    const b = edits.storyPoint(
      864 * scale,
      768 * scale,
      1080 * scale,
      1920 * scale
    )
    assert.deepEqual(edits.storyBoxFromPoints(b, a), [100, 200, 400, 800])
  }
  assert.deepEqual(edits.storyPoint(-20, 999, 100, 100), [0, 1000])
  assert.equal(edits.storyPoint(1, 1, 0, 0), null)
  assert.equal(edits.storyPoint(NaN, 1, 100, 100), null)
  assert.deepEqual(edits.storyBoxStyle([100, 200, 400, 800]), {
    top: "10%",
    left: "20%",
    height: "30%",
    width: "60%",
  })
})

test("invalid geometry, empty edits, missing destinations and foreign paths are rejected", () => {
  assert.ok(edits.storyEditInput.safeParse(base).success)
  for (const box of [
    [],
    [0, 0, 500],
    [0, 0, 500, 500, 1000],
    [0, "0", 500, 500],
    [500, 0, 200, 1000],
    [0, 900, 1000, 800],
    [-1, 0, 500, 500],
    [0, 0, 1001, 500],
    [0, 0, 0, 500],
    [0, 0, 100.5, 500],
  ]) {
    assert.equal(
      edits.storyEditInput.safeParse({
        ...base,
        regions: [region("remove", { box })],
      }).success,
      false
    )
    assert.equal(
      edits.storyEditInput.safeParse({
        ...base,
        regions: [region("move", { target: box })],
      }).success,
      false
    )
  }
  for (const bad of [
    { instructions: "" },
    { image: "https://evil.example/x.jpg" },
    { image: "uploads/../x.jpg" },
    { regions: [region("move")] },
    { regions: [region("change")] },
    { regions: [region("add")] },
    { photos: ["https://evil.example/x.jpg"] },
    { regions: Array(13).fill(region("remove")) },
  ])
    assert.equal(
      edits.storyEditInput.safeParse({ ...base, ...bad }).success,
      false
    )
})

test("Klein receives the current image first and only its supported quality settings", () => {
  const body = edits.storyEditRequest(
    { ...base, photos: ["products/new.webp", source, "products/new.webp"] },
    "data:image/jpeg;base64,original",
    url
  )
  assert.equal(body.model, "black-forest-labs/flux-3-image-klein")
  assert.equal(body.resolution, "2K")
  assert.equal(body.aspect_ratio, "9:16")
  assert.equal(body.output_format, "jpeg")
  assert.equal(body.n, 1)
  assert.equal(body.quality, undefined)
  assert.equal(body.background, undefined)
  assert.deepEqual(
    body.input_references.map((row) => row.image_url.url),
    ["data:image/jpeg;base64,original", url("products/new.webp")]
  )
})

test("the prompt follows BFL's New, Remove and Move table without losing selected coordinates", () => {
  const regions = [
    region("change", { instruction: 'Text reading exactly "SAVE 25%".' }),
    region("add", { instruction: "A small white star" }),
    region("remove"),
    region("move", { target: [500, 100, 800, 700] }),
  ]
  const prompt = edits.storyEditPrompt({ ...base, regions })
  const rows = JSON.parse(prompt.slice(prompt.lastIndexOf("\n\n") + 2))
  assert.deepEqual(rows[0], {
    id: "region_1",
    from: null,
    src_bbox: null,
    tgt_bbox: regions[0].box,
    desc: regions[0].instruction,
  })
  assert.equal(rows[1].from, null)
  assert.equal(rows[2].from, "ref_image_0")
  assert.deepEqual(rows[2].src_bbox, regions[2].box)
  assert.equal(rows[2].tgt_bbox, null)
  assert.deepEqual(rows[3].tgt_bbox, regions[3].target)
  assert.match(prompt, /everything outside the edited regions unchanged/)
  assert.match(prompt, /Preserve the Q Audio logo exactly/)
  assert.match(prompt, /1080 × 1920/)
})

test("the chat round trip pins the exact version, boxes, operations and feedback", () => {
  const input = edits.storyEditInput.parse({
    ...base,
    regions: [
      region("move", {
        target: [400, 100, 700, 900],
        instruction: "Move the headline lower",
      }),
    ],
  })
  const message = edits.storyEditMessage(input)
  assert.deepEqual(edits.readStoryEdit(message), input)
  assert.equal(
    edits.readStoryEdit('Story edit: {"image":"https://evil.example/a.jpg"}'),
    null
  )
  assert.equal(edits.readStoryEdit("Story edit: broken"), null)
})

test("keyboard box movement and resizing stay inside the image without coordinate inputs", () => {
  assert.deepEqual(
    edits.adjustStoryBox([0, 0, 200, 300], "ArrowLeft"),
    [0, 0, 200, 300]
  )
  assert.deepEqual(
    edits.adjustStoryBox([800, 700, 1000, 1000], "ArrowDown"),
    [800, 700, 1000, 1000]
  )
  assert.deepEqual(
    edits.adjustStoryBox([100, 200, 400, 800], "ArrowRight"),
    [100, 210, 400, 810]
  )
  assert.deepEqual(
    edits.adjustStoryBox([100, 200, 400, 800], "ArrowRight", true),
    [100, 200, 400, 810]
  )
  assert.ok(
    edits.storyBox.safeParse(
      edits.adjustStoryBox([999, 999, 1000, 1000], "ArrowDown", true)
    ).success
  )
})

test("background completion uses Klein and preserves the whole source inside the text-safe frame", async () => {
  const bytes = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: "#d3ad68" },
  })
    .jpeg()
    .toBuffer()
  const body = edits.storyBackgroundRequest({
    bytes,
    mediaType: "image/jpeg",
    width: 1024,
    height: 1536,
    extension: "jpg",
  })
  assert.equal(body.model, edits.STORY_EDIT_MODEL)
  assert.equal(body.aspect_ratio, "9:16")
  assert.equal(body.resolution, "2K")
  assert.match(body.prompt, /continue seamlessly to all four edges/)
  assert.match(body.prompt, /not a blank margin or a mask/)
  const [row] = JSON.parse(
    body.prompt.slice(body.prompt.lastIndexOf("\n\n") + 2)
  )
  assert.deepEqual(row.src_bbox, [0, 0, 1000, 1000])
  const [top, left, bottom, right] = row.tgt_bbox
  assert.ok(top >= 130 && bottom <= 823 && left >= 59 && right <= 941)
  assert.deepEqual(
    Buffer.from(body.input_references[0].image_url.url.split(",")[1], "base64"),
    bytes
  )
})

const ctx = {
  session: {
    id: "story-test-session",
    auth: {
      current: {
        principalType: "user",
        attributes: { supabaseAccessToken: "admin-token" },
      },
    },
  },
}
const first = {
  brief: "Design the shop's sale story.",
  address: true,
  photos: [],
}

async function fixture(t, options = {}) {
  const image = await sharp({
    create: {
      width: options.width ?? 1080,
      height: options.height ?? 1920,
      channels: 3,
      background: "#333",
    },
  })
    .jpeg()
    .toBuffer()
  const sent = [],
    uploads = [],
    downloads = []
  globalThis.storyFixture = {
    checked: 0,
    admin: options.admin ?? { userId: "admin" },
    client: {
      async rpc(name) {
        return {
          data:
            name === "media_session_event"
              ? "00000000-0000-4000-8000-000000000001"
              : null,
          error: null,
        }
      },
      storage: {
        from(bucket) {
          assert.ok(["media", "chat-uploads"].includes(bucket))
          return {
            async download(path) {
              downloads.push(path)
              return { data: new Blob([image]), error: null }
            },
            async upload(path, bytes, config) {
              assert.equal(bucket, "chat-uploads")
              assert.equal(config.cacheControl, "300")
              if (options.throwUpload) throw new Error("provider secret")
              uploads.push({ path, bytes, config })
              return {
                error: options.uploadError
                  ? { message: "provider secret" }
                  : null,
              }
            },
            async remove() {
              return {}
            },
          }
        },
      },
    },
  }
  const oldFetch = globalThis.fetch
  const oldKey = process.env.OPENROUTER_API_KEY
  process.env.OPENROUTER_API_KEY = "test-key"
  globalThis.fetch = async (target, init) => {
    sent.push({ target, body: JSON.parse(init.body) })
    if (options.failExtension && sent.length > 1)
      return Response.json(
        { error: { message: "provider secret" } },
        { status: 429 }
      )
    if (options.offline) throw new TypeError("provider secret")
    if (options.status)
      return Response.json(
        { error: { message: "provider secret" } },
        { status: options.status }
      )
    return Response.json({
      data: [
        {
          b64_json: (options.replies?.[sent.length - 1] ?? image).toString(
            "base64"
          ),
          media_type: "image/jpeg",
        },
      ],
      usage: { cost: 0.014 },
    })
  }
  t.after(() => {
    globalThis.fetch = oldFetch
    if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = oldKey
    delete globalThis.storyFixture
  })
  return { sent, uploads, downloads }
}

test("uploaded photo edits verify the admin and call Klein once with the selected image and photo framing", async (t) => {
  const f = await fixture(t, { width: 800, height: 600 })
  const session = "00000000-0000-4000-8000-000000000001"
  const path = `uploads/chat/${session}/00000000-0000-4000-8000-000000000002.jpg`
  const input = { ...base, image: path, regions: [region("remove")] }
  const admin = globalThis.storyFixture.admin
  globalThis.storyFixture.admin = null
  assert.match((await applyImageEdit(input)).problem, /Sign in/)
  globalThis.storyFixture.admin = admin
  assert.match((await applyImageEdit(base)).problem, /Upload an image/)
  assert.deepEqual(f.downloads, [])
  assert.deepEqual(f.sent, [])

  const result = await applyImageEdit(input)
  assert.equal(result.cost, 0.014)
  assert.deepEqual(f.downloads, [path])
  assert.equal(f.sent.length, 1)
  const [{ body }] = f.sent
  assert.equal(body.model, edits.STORY_EDIT_MODEL)
  assert.equal(body.aspect_ratio, "auto")
  assert.equal(body.input_references.length, 1)
  assert.match(
    body.input_references[0].image_url.url,
    /^data:image\/jpeg;base64,/
  )
  assert.match(body.prompt, /source photo's aspect ratio/)
  assert.doesNotMatch(body.prompt, /Instagram|1080 × 1920/)
  const [box] = JSON.parse(body.prompt.split("\n\n").at(-1))
  assert.deepEqual(box.src_bbox, input.regions[0].box)
  assert.equal(f.uploads.length, 1)
  assert.ok(f.uploads[0].path.startsWith(`uploads/chat/${session}/`))
  assert.notEqual(f.uploads[0].path, path)
  assert.deepEqual(result.image, {
    path: f.uploads[0].path,
    width: 800,
    height: 600,
  })
  assert.equal((await sharp(f.uploads[0].bytes).metadata()).format, "jpeg")
})

for (const [name, definition, input] of [
  ["first design", designTool, first],
  ["revision", editTool, base],
]) {
  test(`the ${name} workflow shows the image, then waits before returning it to the agent`, async (t) => {
    const f = await fixture(t)
    let respond
    let asked = false
    const sequence = definition.execute(input, {
      ...ctx,
      ask: (question) => {
        asked = true
        assert.equal(question.options[0].id, "continue")
        return new Promise((resolve) => {
          respond = resolve
        })
      },
    })
    const starting = await sequence.next()
    assert.equal(starting.value.status, "designing")
    const preview = await sequence.next()
    assert.equal(preview.done, false)
    assert.equal(preview.value.review, "waiting")
    assert.equal(preview.value.images.length, 1)
    assert.equal(f.sent.length, 1)
    let finished = false
    const waiting = sequence.next().then((result) => {
      finished = true
      return result
    })
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(asked, true)
    assert.equal(finished, false)
    assert.equal(f.sent.length, 1)
    respond({ status: "answered", optionId: "continue" })
    const result = await waiting
    assert.equal(result.done, true)
    assert.equal(result.value.review, "continued")
    assert.deepEqual(result.value.design, preview.value.design)
    assert.deepEqual(result.value.usage, preview.value.usage)
    assert.equal(f.sent.length, 1)
  })
}

test("both image operations check admin access before paid requests or Storage", async (t) => {
  const f = await fixture(t)
  const unsigned = { session: { auth: { current: null } } }
  for (const [run, input] of [
    [editStory, base],
    [designStory, first],
  ]) {
    assert.ok((await run(input, unsigned)).problem)
    for (const state of ["invalid", "forbidden"]) {
      globalThis.storyFixture.admin = state
      assert.ok((await run(input, ctx)).problem)
    }
  }
  assert.equal(f.sent.length, 0)
  assert.equal(f.downloads.length, 0)
  assert.equal(f.uploads.length, 0)
})

test("an edit reads its source through caller Storage and stages a new matched JPEG without touching the original", async (t) => {
  const f = await fixture(t)
  const result = await editStory(base, ctx)
  assert.equal(result.images.length, 1)
  assert.deepEqual(f.downloads, [source])
  assert.equal(f.sent.length, 1)
  assert.equal(f.sent[0].body.model, edits.STORY_EDIT_MODEL)
  assert.match(
    f.sent[0].body.input_references[0].image_url.url,
    /^data:image\/jpeg;base64,/
  )
  assert.notEqual(result.images[0].path, source)
  const metadata = await sharp(f.uploads[0].bytes).metadata()
  assert.deepEqual(
    [metadata.width, metadata.height, metadata.format, metadata.space],
    [1080, 1920, "jpeg", "srgb"]
  )
  assert.equal(f.uploads[0].config.upsert, false)
})

test("an invalid source frame is refused before charging", async (t) => {
  const f = await fixture(t, { width: 1024 })
  assert.match((await editStory(base, ctx)).problem, /1080 × 1920/)
  assert.equal(f.sent.length, 0)
})

test("a wrong-aspect initial design gets one Klein background edit, never a second GPT generation", async (t) => {
  const wrong = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: "#c9a368" },
  })
    .jpeg()
    .toBuffer()
  const f = await fixture(t, { replies: [wrong] })
  const result = await designStory(first, ctx)
  assert.deepEqual(
    f.sent.map((item) => item.body.model),
    ["openai/gpt-image-2.6-flare", edits.STORY_EDIT_MODEL]
  )
  assert.equal(result.images.length, 1)
  assert.equal(result.cost, 0.028)
  assert.deepEqual(result.usage, [
    { model: "openai/gpt-image-2.6-flare", costUsd: 0.014 },
    { model: edits.STORY_EDIT_MODEL, costUsd: 0.014 },
  ])
  const meta = await sharp(f.uploads[0].bytes).metadata()
  assert.deepEqual([meta.width, meta.height], [1080, 1920])
})

for (const failExtension of [false, true]) {
  test(`background completion stops after one attempt on ${failExtension ? "failure" : "another wrong aspect"}`, async (t) => {
    const wrong = await sharp({
      create: { width: 1024, height: 1536, channels: 3, background: "#c9a368" },
    })
      .jpeg()
      .toBuffer()
    const f = await fixture(t, { replies: [wrong, wrong], failExtension })
    const result = await designStory(first, ctx)
    assert.ok(result.problem)
    assert.equal(f.sent.length, 2)
    assert.equal(f.uploads.length, 0)
    assert.doesNotMatch(result.problem, /provider secret/)
  })
}

for (const failure of [
  { offline: true },
  { status: 400 },
  { status: 429 },
  { uploadError: true },
  { throwUpload: true },
]) {
  test(`paid edits never throw or repeat on ${JSON.stringify(failure)}`, async (t) => {
    const f = await fixture(t, failure)
    const result = await editStory(base, ctx)
    assert.equal(f.sent.length, 1)
    assert.ok(result.problem)
    assert.doesNotMatch(result.problem, /provider secret/)
    if (failure.uploadError || failure.throwUpload)
      assert.deepEqual(result.usage, [
        { model: edits.STORY_EDIT_MODEL, costUsd: 0.014 },
      ])
  })
}
