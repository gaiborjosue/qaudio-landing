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

const { readZernioConfig, zernioInstagramStatus } =
  await import("../lib/admin/zernio-api.ts")
const { connectionHealth } = await import("../lib/admin/connection-health.ts")
const instagram = await import("../lib/admin/instagram-posts.ts")
const { instagramFrame, instagramScheduleProblem } =
  await import("../lib/admin/instagram.ts")
const { instagramPostInputSchema, instagramPostProposalSchema } =
  await import("../lib/admin/schemas.ts")
const { toStoreDateTime } = await import("../lib/admin/store-time.ts")
const choice = await import("../lib/admin/approval-choice.ts")

const profileId = "000000000000000000000001"
const config = { apiKey: "test-only-api-key", profileId }
const account = {
  _id: "000000000000000000000002",
  profileId,
  platform: "instagram",
  username: "test.account",
  isActive: true,
}

function reply(body, status = 200) {
  return async () => Response.json(body, { status })
}

test("configuration requires a key and an explicit valid profile", async () => {
  for (const env of [
    {},
    { ZERNIO_API_KEY: "test" },
    { ZERNIO_API_KEY: "test", ZERNIO_PROFILE_ID: "another-profile" },
  ])
    assert.equal(readZernioConfig(env), null)
  assert.deepEqual(
    readZernioConfig({
      ZERNIO_API_KEY: " test-only-api-key ",
      ZERNIO_PROFILE_ID: ` ${profileId} `,
    }),
    config
  )
  const status = await zernioInstagramStatus(null, () => {
    assert.fail("Unconfigured integrations must not make a request")
  })
  assert.equal(status.state, "unconfigured")
  assert.equal(status.connectUrl, null)
})

test("the SDK sends a scoped, uncached GET with bearer auth and a timeout", async () => {
  let calls = 0
  const status = await zernioInstagramStatus(config, async (request) => {
    calls++
    const url = new URL(request.url)
    assert.equal(
      `${url.origin}${url.pathname}`,
      "https://zernio.com/api/v1/accounts"
    )
    assert.equal(url.searchParams.get("profileId"), profileId)
    assert.equal(url.searchParams.get("platform"), "instagram")
    assert.equal(url.searchParams.get("excludeHidden"), "true")
    assert.equal(request.method, "GET")
    assert.equal(
      request.headers.get("Authorization"),
      `Bearer ${config.apiKey}`
    )
    assert.equal(request.cache, "no-store")
    assert.equal(request.redirect, "error")
    assert.ok(request.signal)
    assert.equal(url.href.includes(config.apiKey), false)
    return Response.json({
      accounts: [
        {
          ...account,
          accessToken: "must-not-leak",
          metadata: { secret: true },
        },
      ],
      otherSecret: "must-not-leak",
    })
  })
  assert.equal(calls, 1)
  assert.deepEqual(status, {
    state: "connected",
    accounts: [{ id: account._id, username: account.username }],
    connectUrl: "https://zernio.com",
  })
})

test("defense in depth excludes other profiles, platforms, and hidden accounts", async () => {
  const status = await zernioInstagramStatus(
    config,
    reply({
      accounts: [
        { ...account, profileId: "000000000000000000000099" },
        { ...account, platform: "facebook" },
        { ...account, enabled: false },
        {
          ...account,
          profileId: { _id: profileId, secret: "never-return" },
          username: "@allowed",
        },
      ],
    })
  )
  assert.deepEqual(status.accounts, [{ id: account._id, username: "allowed" }])
  assert.equal(status.state, "connected")
})

test("revoked and inactive accounts never get a green connected status", async () => {
  for (const change of [{ isActive: false }, { needsReconnection: true }]) {
    const status = await zernioInstagramStatus(
      config,
      reply({ accounts: [{ ...account, ...change }] })
    )
    assert.equal(status.state, "reconnect")
    assert.deepEqual(status.accounts, [])
  }
})

test("one healthy account cannot hide another account needing attention", async () => {
  for (const change of [
    { isActive: false },
    { needsReconnection: true },
    { username: undefined },
  ]) {
    const status = await zernioInstagramStatus(
      config,
      reply({
        accounts: [
          account,
          {
            ...account,
            _id: "000000000000000000000003",
            ...change,
            accessToken: "must-not-leak",
          },
        ],
      })
    )
    assert.equal(status.state, "connected")
    assert.equal(status.needsAttention, true)
    assert.deepEqual(status.accounts, [
      { id: account._id, username: account.username },
    ])
    assert.equal(connectionHealth([status]), "warning")
    assert(!JSON.stringify(status).includes("must-not-leak"))
  }
})

test("the header is green only after every service is checked and connected", () => {
  const connected = {
    state: "connected",
    accounts: [{ id: account._id, username: account.username }],
  }
  assert.equal(connectionHealth([]), "checking")
  assert.equal(connectionHealth([null]), "checking")
  assert.equal(connectionHealth([connected, null]), "checking")
  assert.equal(connectionHealth([connected, connected]), "healthy")
  assert.equal(connectionHealth([{ ...connected, accounts: [] }]), "warning")
  assert.equal(
    connectionHealth([connected, { ...connected, needsAttention: true }]),
    "warning"
  )
  for (const state of [
    "disconnected",
    "reconnect",
    "unavailable",
    "unconfigured",
  ]) {
    assert.equal(
      connectionHealth([connected, { state, accounts: [] }]),
      "warning"
    )
    assert.equal(connectionHealth([null, { state, accounts: [] }]), "warning")
  }
})

test("empty, unrelated, and hidden account lists are disconnected", async () => {
  for (const accounts of [
    [],
    [{ ...account, enabled: false }],
    [{ ...account, profileId: "elsewhere" }],
  ]) {
    const status = await zernioInstagramStatus(config, reply({ accounts }))
    assert.equal(status.state, "disconnected")
    assert.deepEqual(status.accounts, [])
  }
})

test("malformed responses and unnamed accounts are unavailable", async () => {
  for (const body of [
    {},
    { accounts: null },
    { accounts: [{ _id: "broken" }] },
    { accounts: [{ ...account, username: undefined }] },
    { accounts: [{ ...account, username: "@@" }] },
  ]) {
    const status = await zernioInstagramStatus(config, reply(body))
    assert.equal(status.state, "unavailable")
    assert.deepEqual(status.accounts, [])
  }
})

test("provider errors are redacted and distinguish authentication and rate limiting", async () => {
  for (const code of [401, 403, 429, 500, 502]) {
    const status = await zernioInstagramStatus(
      config,
      reply(
        {
          error: `sensitive ${config.apiKey}`,
          details: { token: "private-token" },
        },
        code
      )
    )
    assert.equal(
      status.state,
      code === 401 || code === 403 ? "unconfigured" : "unavailable"
    )
    assert.equal(JSON.stringify(status).includes(config.apiKey), false)
    assert.equal(JSON.stringify(status).includes("private-token"), false)
    if (code === 429) assert.match(status.message, /busy/)
    assert.deepEqual(status.accounts, [])
  }
})

test("timeouts and network errors clear connected status without leaking details", async () => {
  for (const error of [
    new DOMException("private-token", "TimeoutError"),
    new Error(config.apiKey),
  ]) {
    const status = await zernioInstagramStatus(config, async () => {
      throw error
    })
    assert.equal(status.state, "unavailable")
    assert.deepEqual(status.accounts, [])
    assert.equal(JSON.stringify(status).includes(config.apiKey), false)
    assert.equal(JSON.stringify(status).includes("private-token"), false)
  }
})

// Instagram publishing (lib/admin/instagram-posts.ts) with mocked transport.

const postId = "0000000000000000000000a1"
const otherAccount = "0000000000000000000000ff"
const photo = {
  path: "instagram/one.webp",
  width: 1600,
  height: 1200,
  alt: "A turntable",
}
const tune = { v: 1, kind: "feed", fit: "cover", photos: [photo] }

/** A Zernio post as the API returns it, with fields that must not leak. */
function zernioPost(change = {}, target = {}) {
  return {
    _id: postId,
    userId: { _id: "u1", email: "private@example.com" },
    status: "scheduled",
    content: "New in: the Orbit Theory.",
    scheduledFor: "2030-01-02T23:00:00.000Z",
    mediaItems: [{ type: "image", url: "https://media.zernio.com/p/1.jpg" }],
    metadata: { tune, usageCounted: true },
    ...change,
    platforms: [
      {
        platform: "instagram",
        accountId: account._id,
        status: "pending",
        platformError: { message: "raw provider payload", fbtrace_id: "x" },
        ...target,
      },
    ],
  }
}

/** Routes "METHOD /path" to handlers and records every request. */
function routes(table) {
  const calls = []
  const fetcher = async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init)
    const url = new URL(request.url)
    const type = request.headers.get("content-type") ?? ""
    const body =
      request.method === "GET" || request.method === "DELETE"
        ? null
        : type.includes("json")
          ? await request.clone().json()
          : new Uint8Array(await request.clone().arrayBuffer())
    const key = `${request.method} ${url.origin === "https://zernio.com" ? url.pathname.replace("/api/v1", "") : url.href}`
    calls.push({ key, url, request, body, init })
    const handler = table[key]
    if (!handler) throw new Error(`Unexpected request: ${key}`)
    return handler({ url, request, body })
  }
  return { fetcher, calls }
}

const json =
  (body, status = 200) =>
  () =>
    Response.json(body, { status })
const accountsReply = json({ accounts: [account] })

const leaks = (value) =>
  [
    config.apiKey,
    "private@example.com",
    "raw provider payload",
    "usageCounted",
    "secret-token",
  ].filter((secret) => JSON.stringify(value).includes(secret))

test("photos are fitted to Instagram's frames", () => {
  assert.deepEqual(instagramFrame("feed", undefined, { width: 1, height: 1 }), {
    width: 1080,
    height: 1080,
    fit: "cover",
    background: "#ffffff",
  })
  // Taller than 4:5 is cropped to 4:5; wider than 1.91:1 to 1.91:1.
  assert.equal(
    instagramFrame("feed", undefined, { width: 1080, height: 1920 }).height,
    1350
  )
  assert.equal(
    instagramFrame("feed", undefined, { width: 3000, height: 1000 }).height,
    565
  )
  assert.equal(
    instagramFrame("feed", "contain", { width: 1080, height: 1920 }).fit,
    "contain"
  )
  // Stories fill the screen only when the photo is already tall.
  const tall = instagramFrame("story", undefined, { width: 1080, height: 1920 })
  assert.deepEqual(tall, {
    width: 1080,
    height: 1920,
    fit: "cover",
    background: "#000000",
  })
  assert.equal(
    instagramFrame("story", undefined, { width: 1600, height: 1200 }).fit,
    "contain"
  )
  assert.equal(
    instagramFrame("story", "cover", { width: 1600, height: 1200 }).fit,
    "cover"
  )
})

test("scheduling is limited to the next 7 days", () => {
  const now = Date.parse("2030-01-01T15:00:00.000Z")
  const at = (hours) => toStoreDateTime(new Date(now + hours * 3_600_000))
  assert.equal(instagramScheduleProblem(at(1), now), null)
  assert.equal(instagramScheduleProblem(at(24 * 7 - 1), now), null)
  assert.match(instagramScheduleProblem(at(-1), now), /passed/)
  assert.match(instagramScheduleProblem(at(24 * 7 + 1), now), /7 days/)

  const post = {
    kind: "feed",
    photos: [photo],
    caption: "",
    when: toStoreDateTime(new Date(Date.now() + 8 * 86_400_000)),
  }
  // The preview still renders it; the tool refuses it before approval.
  assert.equal(instagramPostInputSchema.safeParse(post).success, true)
  assert.equal(instagramPostProposalSchema.safeParse(post).success, false)
  assert.equal(
    instagramPostProposalSchema.safeParse({ ...post, when: "draft" }).success,
    true
  )
})

test("post input follows Instagram's rules", () => {
  const valid = { kind: "feed", photos: [photo], caption: "", when: "now" }
  const rejects = (change) =>
    assert.equal(
      instagramPostInputSchema.safeParse({ ...valid, ...change }).success,
      false
    )
  rejects({ kind: "story", photos: [photo, photo] })
  rejects({ kind: "story", caption: "Stories have no caption" })
  rejects({ photos: Array(11).fill(photo) })
  rejects({ photos: [{ ...photo, path: "brands/logo.png" }] })
  rejects({ photos: [{ ...photo, path: "uploads/../secret" }] })
  rejects({
    caption: Array.from({ length: 31 }, (_, i) => `#tag${i}`).join(" "),
  })
  rejects({ caption: "x".repeat(2201) })
  rejects({ id: "not-a-zernio-id" })
  assert.equal(
    instagramPostInputSchema.safeParse({
      ...valid,
      photos: [{ ...photo, path: "uploads/new.webp" }, photo],
      caption: "#hifi #vinyl",
    }).success,
    true
  )
})

test("listing posts is scoped to the profile and allowlisted", async () => {
  const { fetcher, calls } = routes({
    "GET /accounts": accountsReply,
    "GET /posts": json({
      posts: [
        zernioPost(
          { status: "failed" },
          {
            errorMessage: `Media fetch failed https://cdn.example.com/x?token=abc ${"a".repeat(40)} ${config.apiKey}`,
          }
        ),
        zernioPost({ _id: "0000000000000000000000a2", metadata: null }),
        zernioPost(
          { _id: "0000000000000000000000a3", status: "published" },
          {
            platformPostUrl: "https://www.instagram.com/p/abc/",
            publishedAt: "2030-01-01T12:00:00.000Z",
          }
        ),
        zernioPost(
          { _id: "0000000000000000000000a4" },
          { accountId: otherAccount }
        ),
        { broken: true },
      ],
      pagination: { total: 5 },
    }),
  })
  const listed = await instagram.listInstagramPosts(
    config,
    { status: "scheduled", limit: 20 },
    fetcher
  )
  const query = calls.find((call) => call.key === "GET /posts").url.searchParams
  assert.equal(query.get("profileId"), profileId)
  assert.equal(query.get("platform"), "instagram")
  assert.equal(query.get("status"), "scheduled")
  assert.equal(query.get("sortBy"), "scheduled-asc")
  assert.deepEqual(listed.accounts, [account.username])
  assert.deepEqual(
    listed.posts.map((post) => post.id),
    [postId, "0000000000000000000000a2", "0000000000000000000000a3"]
  )
  const [failed, outside, published] = listed.posts
  assert.deepEqual(Object.keys(failed).sort(), [
    "account",
    "caption",
    "editable",
    "fit",
    "id",
    "kind",
    "made_in_tune",
    "photos",
    "problem",
    "published_at",
    "scheduled_for",
    "status",
    "url",
  ])
  assert.equal(failed.editable, false)
  assert.equal(failed.problem.includes("token=abc"), false)
  assert.equal(failed.problem.includes("a".repeat(40)), false)
  assert.equal(failed.scheduled_for, "2030-01-02T18:00")
  assert.deepEqual(failed.photos, [photo])
  assert.equal(outside.made_in_tune, false)
  assert.equal(outside.editable, false)
  assert.equal(published.url, "https://www.instagram.com/p/abc/")
  assert.equal(published.published_at, "2030-01-01T07:00")
  assert.deepEqual(leaks(listed), [])
})

const draft = (change = {}) => ({
  accountId: account._id,
  kind: "feed",
  caption: "New in: the Orbit Theory.",
  media: [{ url: "https://media.zernio.com/temp/1.jpg", alt: "A turntable" }],
  timing: { mode: "schedule", at: "2030-01-02T23:00:00.000Z" },
  record: { kind: "feed", fit: "cover", photos: [photo] },
  ...change,
})

test("creating a post sends one Instagram target with a stable idempotency key", async () => {
  const { fetcher, calls } = routes({
    "POST /posts": json({ post: zernioPost() }, 201),
  })
  const saved = await instagram.createInstagramPost(
    config,
    draft(),
    [{ id: account._id, username: account.username }],
    "tune-key-1",
    fetcher
  )
  const [call] = calls
  assert.equal(call.request.headers.get("Idempotency-Key"), "tune-key-1")
  assert.equal(
    call.request.headers.get("Authorization"),
    `Bearer ${config.apiKey}`
  )
  assert.deepEqual(call.body, {
    content: "New in: the Orbit Theory.",
    mediaItems: [
      {
        type: "image",
        url: "https://media.zernio.com/temp/1.jpg",
        mimeType: "image/jpeg",
        altText: "A turntable",
      },
    ],
    platforms: [{ platform: "instagram", accountId: account._id }],
    timezone: "America/New_York",
    metadata: { tune: { v: 1, kind: "feed", fit: "cover", photos: [photo] } },
    isDraft: false,
    scheduledFor: "2030-01-02T23:00:00.000Z",
  })
  assert.equal(saved.status, "scheduled")
  assert.equal(saved.scheduled_for, "2030-01-02T18:00")
  assert.deepEqual(leaks(saved), [])

  // Stories: no caption, no alt text, and the story flag.
  const story = routes({ "POST /posts": json({ post: zernioPost() }, 201) })
  await instagram.createInstagramPost(
    config,
    draft({ kind: "story", caption: "", timing: { mode: "now" } }),
    [{ id: account._id, username: account.username }],
    "tune-key-2",
    story.fetcher
  )
  const body = story.calls[0].body
  assert.equal("content" in body, false)
  assert.equal("altText" in body.mediaItems[0], false)
  assert.deepEqual(body.platforms[0].platformSpecificData, {
    contentType: "story",
  })
  assert.equal(body.publishNow, true)
})

test("duplicate and in-flight creates don't post twice", async () => {
  const accounts = [{ id: account._id, username: account.username }]
  const duplicate = routes({
    "POST /posts": json(
      {
        error: "duplicate",
        details: { existingPostId: postId, accountId: account._id },
      },
      409
    ),
    [`GET /posts/${postId}`]: json({ post: zernioPost() }),
  })
  const saved = await instagram.createInstagramPost(
    config,
    draft(),
    accounts,
    "k",
    duplicate.fetcher
  )
  assert.equal(saved.duplicate, true)
  assert.equal(saved.id, postId)

  const busy = routes({
    "POST /posts": json(
      { error: "processing", code: "idempotency_conflict" },
      409
    ),
  })
  await assert.rejects(
    instagram.createInstagramPost(config, draft(), accounts, "k", busy.fetcher),
    /still processing/
  )
})

test("only this site's unpublished posts can be deleted or retried", async () => {
  // Another account's post: refused without a DELETE.
  const foreign = routes({
    "GET /accounts": accountsReply,
    [`GET /posts/${postId}`]: json({
      post: zernioPost({}, { accountId: otherAccount }),
    }),
  })
  await assert.rejects(
    instagram.deleteInstagramPost(config, postId, foreign.fetcher),
    /change that one in Zernio/
  )
  assert.equal(
    foreign.calls.some((call) => call.request.method === "DELETE"),
    false
  )

  const published = routes({
    "GET /accounts": accountsReply,
    [`GET /posts/${postId}`]: json({
      post: zernioPost({ status: "published" }),
    }),
  })
  await assert.rejects(
    instagram.deleteInstagramPost(config, postId, published.fetcher),
    /Instagram app/
  )

  const scheduled = routes({
    "GET /accounts": accountsReply,
    [`GET /posts/${postId}`]: json({ post: zernioPost() }),
    [`DELETE /posts/${postId}`]: json({ message: "deleted" }),
  })
  assert.deepEqual(
    await instagram.deleteInstagramPost(config, postId, scheduled.fetcher),
    { deleted: true, id: postId, status: "scheduled" }
  )

  await assert.rejects(
    instagram.retryInstagramPost(config, postId, scheduled.fetcher),
    /Only a failed post/
  )
  const failed = routes({
    "GET /accounts": accountsReply,
    [`GET /posts/${postId}`]: json({ post: zernioPost({ status: "failed" }) }),
    [`POST /posts/${postId}/retry`]: json({
      post: zernioPost(
        { status: "published" },
        { platformPostUrl: "https://www.instagram.com/p/xyz/" }
      ),
    }),
  })
  const retried = await instagram.retryInstagramPost(
    config,
    postId,
    failed.fetcher
  )
  assert.equal(retried.status, "published")
  assert.equal(retried.url, "https://www.instagram.com/p/xyz/")
})

test("photos upload through a presigned HTTPS URL", async () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
  const upload = "https://storage.example.com/put?signature=secret-token"
  const { fetcher, calls } = routes({
    "POST /media/presign": json({
      uploadUrl: upload,
      publicUrl: "https://media.zernio.com/temp/tune-1.jpg",
      expiresIn: 3600,
    }),
    [`PUT ${upload}`]: () => new Response(null, { status: 200 }),
  })
  assert.equal(
    await instagram.uploadInstagramPhoto(config, jpeg, "tune-1", fetcher),
    "https://media.zernio.com/temp/tune-1.jpg"
  )
  assert.deepEqual(calls[0].body, {
    filename: "tune-1.jpg",
    contentType: "image/jpeg",
    size: 4,
  })
  assert.equal(calls[1].request.headers.get("Content-Type"), "image/jpeg")
  assert.deepEqual(calls[1].body, jpeg)
  assert.equal(calls[1].init.redirect, "error")
  // The upload address carries no API key.
  assert.equal(calls[1].request.headers.get("Authorization"), null)

  const insecure = routes({
    "POST /media/presign": json({
      uploadUrl: "http://storage.example.com/put",
      publicUrl: "https://media.zernio.com/temp/x.jpg",
    }),
  })
  await assert.rejects(
    instagram.uploadInstagramPhoto(config, jpeg, "x", insecure.fetcher),
    instagram.InstagramError
  )
  assert.equal(insecure.calls.length, 1)
})

test("account health is allowlisted and degrades without detail", async () => {
  const { fetcher } = routes({
    "GET /accounts": accountsReply,
    "GET /accounts/health": json({
      accounts: [
        {
          accountId: account._id,
          canPost: true,
          needsReconnect: false,
          issues: [`Token ${"b".repeat(40)} expires soon`],
          ownerUserId: "private@example.com",
        },
      ],
    }),
    [`GET /accounts/${account._id}/instagram/publishing-limit`]: json({
      quotaUsage: 3,
      quotaTotal: 100,
      quotaDurationSeconds: 86_400,
    }),
  })
  const health = await instagram.instagramAccountHealth(config, fetcher)
  assert.deepEqual(health, {
    state: "connected",
    message: null,
    accounts: [
      {
        username: account.username,
        can_post: true,
        needs_reconnect: false,
        issues: ["Token [redacted] expires soon"],
        posts_left: 97,
        window_hours: 24,
      },
    ],
  })

  const degraded = routes({
    "GET /accounts": accountsReply,
    "GET /accounts/health": json({ error: "down" }, 500),
    [`GET /accounts/${account._id}/instagram/publishing-limit`]: json(
      { error: "down" },
      500
    ),
  })
  const partial = await instagram.instagramAccountHealth(
    config,
    degraded.fetcher
  )
  assert.equal(partial.accounts[0].can_post, null)
  assert.equal(partial.accounts[0].posts_left, null)

  const disconnected = await instagram.instagramAccountHealth(
    config,
    json({ accounts: [] })
  )
  assert.equal(disconnected.state, "disconnected")
  assert.deepEqual(disconnected.accounts, [])
})

test("photos are converted to fitted, flattened sRGB JPEGs", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= "https://example.supabase.co"
  const { default: sharp } = await import("sharp")
  const { instagramJpeg } = await import("../agent/lib/instagram.ts")
  const png = await sharp({
    create: {
      width: 800,
      height: 1600,
      channels: 4,
      background: { r: 200, g: 40, b: 40, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer()
  const original = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    assert.match(
      String(url),
      /\/storage\/v1\/object\/public\/media\/uploads\/tall\.png$/
    )
    assert.equal(init.redirect, "error")
    return new Response(png, {
      headers: {
        "content-type": "image/png",
        "content-length": String(png.length),
      },
    })
  }
  try {
    const source = { path: "uploads/tall.png", width: 800, height: 1600 }
    const frame = instagramFrame("feed", undefined, source)
    const jpeg = await instagramJpeg(source, frame)
    const meta = await sharp(jpeg).metadata()
    assert.equal(meta.format, "jpeg")
    assert.equal(meta.width, 1080)
    assert.equal(meta.height, 1350)
    assert.equal(meta.hasAlpha, false)
    assert.equal(meta.exif, undefined)
    // A stated size that doesn't match would make the preview lie.
    await assert.rejects(
      instagramJpeg({ ...source, width: 1600, height: 800 }, frame),
      /real size/
    )
  } finally {
    globalThis.fetch = original
  }
})

test("publishing errors are reworded without provider details", async () => {
  for (const [status, pattern] of [
    [400, /didn't accept it: Caption too long/],
    [401, /API key/],
    [402, /billing/],
    [404, /isn't in Zernio/],
    [429, /busy/],
    [500, /couldn't do that/],
  ]) {
    const { fetcher } = routes({
      "POST /posts": json(
        {
          error: `Caption too long ${config.apiKey} https://x.example/secret-token`,
          details: { token: "secret-token" },
        },
        status
      ),
    })
    const error = await instagram
      .createInstagramPost(config, draft(), [], "k", fetcher)
      .catch((caught) => caught)
    assert.ok(error instanceof instagram.InstagramError)
    assert.match(error.message, pattern)
    assert.deepEqual(leaks(error.message), [])
  }
  const timeout = await instagram
    .createInstagramPost(config, draft(), [], "k", async () => {
      throw new DOMException("secret-token", "TimeoutError")
    })
    .catch((caught) => caught)
  assert.match(timeout.message, /check instagram__list_posts/i)
  assert.deepEqual(leaks(timeout.message), [])
})

test("a card approved with a choice approves only that exact re-proposal", () => {
  const photos = ["a", "b", "c"].map((name) => ({
    path: `instagram/${name}.webp`,
    width: 1200,
    height: 1200,
    alt: `Photo ${name}`,
  }))
  const post = {
    kind: "feed",
    photos,
    caption: "Three views #hifi",
    when: "now",
  }
  const arranged = [photos[2], photos[0], photos[1]]
  const card = (callId, input, name = "instagram__save_post") => ({
    role: "assistant",
    parts: [{ type: "tool", name, callId, input }],
  })
  const owner = (text) => ({ role: "user", parts: [{ type: "text", text }] })
  const approveAs = (fields, release = "draft") =>
    owner(choice.approvedMessage("save_instagram_post", release, fields, null))
  const draft = approveAs({ when: "draft" })
  const order = approveAs({ when: "now", photos: arranged }, "now")
  const run = (...messages) => [...choice.approvedProposals(messages).approved]

  assert.match(draft.parts[0].text, /^Save it as a draft\.\nApproved as: /)
  assert.match(order.parts[0].text, /^Post it now, with the photos in the/)
  // The same post saved as a draft (key order and the caption's default
  // don't matter), and the card it replaces.
  assert.deepEqual(
    run(card("1", post), draft, card("2", { ...post, when: "draft" })),
    ["2"]
  )
  assert.deepEqual(
    run(
      card("1", { ...post, caption: "" }),
      draft,
      card("2", { photos, when: "draft", kind: "feed" })
    ),
    ["2"]
  )
  assert.deepEqual(
    [
      ...choice.approvedProposals([
        card("1", post),
        draft,
        card("2", { ...post, when: "draft", caption: "Other" }),
      ]).replaced,
    ],
    ["1"]
  )
  // The photos in a new order, with how it goes out.
  assert.deepEqual(
    run(card("1", post), order, card("2", { ...post, photos: arranged })),
    ["2"]
  )
  // Anything else waits for the owner.
  for (const next of [
    { ...post, when: "draft", caption: "Changed" },
    { ...post, when: "now" },
    { ...post, when: "2030-01-01T09:00" },
  ])
    assert.deepEqual(run(card("1", post), draft, card("2", next)), [])
  for (const next of [
    { ...post, photos },
    { ...post, photos: [photos[1], photos[0], photos[2]] },
  ])
    assert.deepEqual(run(card("1", post), order, card("2", next)), [])
  // Only the very next change card, and only without a newer word from the
  // owner.
  assert.deepEqual(
    run(
      card("1", post),
      draft,
      card("2", { ...post, caption: "Other" }),
      card("3", { ...post, when: "draft" })
    ),
    []
  )
  assert.deepEqual(
    run(
      card("1", post),
      draft,
      card("h", { week: [] }, "hours__set_weekly_hours"),
      card("2", { ...post, when: "draft" })
    ),
    []
  )
  assert.deepEqual(
    run(
      card("1", post),
      draft,
      owner("Actually, wait."),
      card("2", { ...post, when: "draft" })
    ),
    []
  )
  // Fields the card can't set, photos it didn't have, another tool's card,
  // and a choice without a card before it approve nothing.
  assert.deepEqual(
    run(
      card("1", post),
      owner(`Change it.\nApproved as: {"when":"draft","caption":"New"}`),
      card("2", { ...post, when: "draft", caption: "New" })
    ),
    []
  )
  const foreign = [
    { ...photos[0], path: "instagram/other.webp" },
    photos[1],
    photos[2],
  ]
  assert.deepEqual(
    run(
      card("1", post),
      approveAs({ when: "now", photos: foreign }, "now"),
      card("2", { ...post, photos: foreign })
    ),
    []
  )
  assert.deepEqual(
    run(
      card("1", post),
      draft,
      card("2", { ...post, when: "draft" }, "news__save_news_post")
    ),
    []
  )
  assert.deepEqual(run(draft, card("2", { ...post, when: "draft" })), [])
  // A card still streaming its input is skipped until it parses.
  assert.deepEqual(
    run(
      card("1", post),
      draft,
      card("2", { kind: "feed" }),
      card("2", { ...post, when: "draft" })
    ),
    ["2"]
  )
})

test("news posts and deals go out the way the owner picks on the card", () => {
  const now = "2026-11-04T12:00"
  const news = {
    slug: "open-house",
    title: "Open house",
    body: [],
    cover: {
      path: "news/cover.webp",
      width: 1600,
      height: 1000,
      alt: "The shop",
      fit: "cover",
    },
    status: "published",
    published_at: "now",
  }
  const fields = (tool, input, release, at = null) =>
    choice.releaseFields(tool, input, release, at, now)

  // Publishing keeps a live post's date; anything else goes live now.
  assert.deepEqual(fields("save_news_post", news, "now"), {
    status: "published",
    published_at: "now",
  })
  const live = { ...news, published_at: "2026-10-01T09:00" }
  assert.deepEqual(fields("save_news_post", live, "now"), {
    status: "published",
    published_at: "2026-10-01T09:00",
  })
  assert.deepEqual(
    fields("save_news_post", { ...live, status: "draft" }, "now"),
    { status: "published", published_at: "now" }
  )
  assert.deepEqual(fields("save_news_post", news, "draft"), {
    status: "draft",
  })
  assert.deepEqual(
    fields("save_news_post", news, "schedule", "2026-11-06T09:00"),
    { status: "published", published_at: "2026-11-06T09:00" }
  )
  assert.equal(fields("save_news_post", news, "schedule"), null)
  // The proposal's own choice approves it as is; no cover, no publishing.
  assert.equal(
    choice.changesProposal("save_news_post", news, {
      status: "published",
      published_at: "now",
    }),
    false
  )
  assert.equal(
    choice.changesProposal("save_news_post", news, { status: "draft" }),
    true
  )
  assert.equal(
    choice.withFields(
      "save_news_post",
      { ...news, status: "draft", cover: null },
      { status: "published", published_at: "now" }
    ),
    null
  )
  assert.equal(choice.proposedRelease("save_news_post", news, now), "now")
  assert.equal(choice.proposedRelease("save_news_post", live, now), "now")
  assert.equal(
    choice.proposedRelease(
      "save_news_post",
      { ...news, published_at: "2026-11-06T09:00" },
      now
    ),
    "schedule"
  )

  // A deal waiting for its start goes live now; Schedule sets the start,
  // before its end.
  const deal = {
    title: "Open box week",
    summary: "",
    note: "",
    status: "published",
    starts_at: "2026-11-10T09:00",
    ends_at: "2026-11-20T23:59",
    items: [],
  }
  assert.equal(choice.proposedRelease("save_deal", deal, now), "schedule")
  assert.deepEqual(fields("save_deal", deal, "now"), {
    status: "published",
    starts_at: null,
  })
  assert.deepEqual(
    fields("save_deal", { ...deal, starts_at: "2026-11-01T09:00" }, "now"),
    { status: "published", starts_at: "2026-11-01T09:00" }
  )
  assert.equal(choice.scheduledAt("save_deal", deal), "2026-11-10T09:00")
  assert.equal(choice.scheduleBefore("save_deal", deal), "2026-11-20T23:59")
  assert.equal(
    choice.withFields("save_deal", deal, {
      status: "published",
      starts_at: "2026-11-21T09:00",
    }),
    null
  )

  // Their re-proposals approve themselves only when exact.
  const card = (callId, input, name) => ({
    role: "assistant",
    parts: [{ type: "tool", name, callId, input }],
  })
  const owner = (text) => ({ role: "user", parts: [{ type: "text", text }] })
  const run = (...messages) => [...choice.approvedProposals(messages).approved]
  const publish = owner(
    choice.approvedMessage(
      "save_deal",
      "now",
      fields("save_deal", deal, "now"),
      null
    )
  )
  assert.deepEqual(
    run(
      card("1", deal, "deals__save_deal"),
      publish,
      card("2", { ...deal, starts_at: null }, "deals__save_deal")
    ),
    ["2"]
  )
  assert.deepEqual(
    run(
      card("1", deal, "deals__save_deal"),
      publish,
      card(
        "2",
        { ...deal, starts_at: null, title: "Other" },
        "deals__save_deal"
      )
    ),
    []
  )
  const at = "2026-11-06T09:00"
  const scheduled = owner(
    choice.approvedMessage(
      "save_news_post",
      "schedule",
      fields("save_news_post", news, "schedule", at),
      at
    )
  )
  assert.match(
    scheduled.parts[0].text,
    /^Schedule it for Nov 6, 2026, 9:00\u00a0am\.\nApproved as: /
  )
  assert.deepEqual(
    run(
      card("1", news, "news__save_news_post"),
      scheduled,
      card("2", { ...news, published_at: at }, "news__save_news_post")
    ),
    ["2"]
  )
  // With two cards before it, a choice goes to the one whose fields it sets.
  const instagramPost = {
    kind: "feed",
    photos: [
      { path: "instagram/a.webp", width: 1200, height: 1200, alt: "Photo" },
    ],
    caption: "",
    when: "now",
  }
  assert.deepEqual(
    run(
      card("i", instagramPost, "instagram__save_post"),
      card("n", news, "news__save_news_post"),
      owner(
        choice.approvedMessage(
          "save_instagram_post",
          "draft",
          { when: "draft" },
          null
        )
      ),
      card("2", { ...instagramPost, when: "draft" }, "instagram__save_post")
    ),
    ["2"]
  )
})
