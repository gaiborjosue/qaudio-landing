import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

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
const api = await import("../lib/admin/google-business-api.ts")
const schemas = await import("../lib/admin/schemas.ts")
const choices = await import("../lib/admin/approval-choice.ts")
const { cardHeading } = await import("../lib/admin/card-heading.ts")
const { connectionHealth } = await import("../lib/admin/connection-health.ts")
const config = {
  apiKey: "fake-google-business-test-key",
  profileId: "000000000000000000000001",
}
const target = {
  account_id: "000000000000000000000002",
  location_id: "locations/123",
  business: "Test shop",
}
const account = {
  _id: target.account_id,
  profileId: config.profileId,
  platform: "googlebusiness",
  isActive: true,
  displayName: target.business,
}
const special = (day, closed = true) => ({
  startDate: { year: 2030, month: 11, day },
  endDate: { year: 2030, month: 11, day },
  closed,
})
const details = {
  locationId: "123",
  title: target.business,
  location: { isVerified: true },
  regularHours: { periods: [] },
  specialHours: { specialHourPeriods: [special(5), special(26)] },
}
const hoursInput = () => ({
  target,
  revision: api.googleBusinessRevision({
    regularHours: details.regularHours,
    specialHours: details.specialHours,
  }),
  changes: [{ starts_on: "2030-11-26", ends_on: "2030-11-27", kind: "closed" }],
})
const postInput = { target, content: "Holiday opening hours.", when: "draft" }
const record = (overrides = {}) => ({
  _id: "000000000000000000000003",
  status: "draft",
  content: "Holiday opening hours.",
  mediaItems: [],
  platforms: [
    {
      platform: "googlebusiness",
      accountId: target.account_id,
      platformSpecificData: {
        locationId: target.location_id,
        topicType: "STANDARD",
      },
    },
  ],
  metadata: { tuneGoogleBusiness: { v: 1, target } },
  ...overrides,
})

function mock({
  accounts = [account],
  location = details,
  post = record(),
  posts = [post],
  status = 200,
} = {}) {
  const calls = []
  return {
    calls,
    fetch: async (request) => {
      const url = new URL(request.url)
      assert.equal(url.origin, "https://zernio.com")
      assert.equal(
        request.headers.get("Authorization"),
        `Bearer ${config.apiKey}`
      )
      assert.equal(request.cache, "no-store")
      assert.equal(request.redirect, "error")
      const body =
        request.method === "GET" ? null : await request.json().catch(() => null)
      calls.push({
        method: request.method,
        url,
        body,
        headers: request.headers,
      })
      if (url.pathname.endsWith("/accounts")) {
        assert.equal(url.searchParams.get("profileId"), config.profileId)
        assert.equal(url.searchParams.get("platform"), "googlebusiness")
        return Response.json({ accounts })
      }
      if (url.pathname.endsWith("/gmb-location-details"))
        return Response.json(
          request.method === "GET" ? location : { success: true }
        )
      if (url.pathname.endsWith("/posts") && request.method === "GET")
        return Response.json({ posts })
      if (request.method === "DELETE") return Response.json({ success: true })
      return Response.json(
        {
          post:
            request.method === "POST" || request.method === "PUT"
              ? { ...post, ...(body ?? {}), _id: post._id, status: post.status }
              : post,
        },
        { status }
      )
    },
  }
}
async function withWrites(work) {
  const old = [
    process.env.NODE_ENV,
    process.env.ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED,
  ]
  process.env.NODE_ENV = "development"
  process.env.ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED = "true"
  try {
    return await work()
  } finally {
    for (const [i, name] of [
      "NODE_ENV",
      "ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED",
    ].entries()) {
      if (old[i] === undefined) delete process.env[name]
      else process.env[name] = old[i]
    }
  }
}

test("GET status scopes accounts, strips secrets and keeps mixed failures visible", async () => {
  const m = mock({
    accounts: [
      { ...account, accessToken: "secret", metadata: { token: "secret" } },
      { ...account, _id: "000000000000000000000004", isActive: false },
      { ...account, platform: "instagram" },
      { ...account, profileId: "another-profile" },
      { ...account, enabled: false },
    ],
  })
  const status = await api.zernioGoogleBusinessStatus(config, m.fetch)
  assert.deepEqual(status.accounts, [
    { id: target.account_id, name: target.business },
  ])
  assert.equal(status.needsAttention, true)
  assert.equal(JSON.stringify(status).includes("secret"), false)
  assert(m.calls.every((c) => c.method === "GET"))
  assert.equal(
    connectionHealth([{ state: "connected", accounts: [{}] }, status]),
    "warning"
  )
  assert.equal(
    connectionHealth([{ state: "connected", accounts: [{}] }, null]),
    "checking"
  )
})
test("unconfigured and provider failures return only safe status messages", async () => {
  assert.equal(
    (await api.zernioGoogleBusinessStatus(null, () => assert.fail())).state,
    "unconfigured"
  )
  const result = await api.zernioGoogleBusinessStatus(config, async () => {
    throw new Error(config.apiKey)
  })
  assert.equal(result.state, "unavailable")
  assert(!JSON.stringify(result).includes(config.apiKey))
})
test("location read is GET-only and excludes raw listing metadata", async () => {
  const m = mock({
    location: {
      ...details,
      accessToken: "secret",
      metadata: { secret: true },
      phoneNumbers: { primaryPhone: "private" },
    },
  })
  const result = await api.readGoogleBusinessLocation(
    config,
    target.account_id,
    m.fetch
  )
  assert.deepEqual(result.target, target)
  assert.equal(result.verified, true)
  assert.equal(result.revision, hoursInput().revision)
  assert(m.calls.every((c) => c.method === "GET"))
  assert(!JSON.stringify(result).includes("secret"))
  await assert.rejects(
    api.readGoogleBusinessLocation(config, "000000000000000000000099", m.fetch),
    /isn't connected/
  )
})
test("writes depend on the explicit flag, not production mode; disabled writes stop before I/O", async () => {
  for (const env of [
    {},
    { NODE_ENV: "development", ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED: "false" },
    { NODE_ENV: "production" },
    { NODE_ENV: "production", ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED: "TRUE" },
  ])
    assert.throws(() => api.assertGoogleBusinessWrites(env), /read-only/)
  for (const nodeEnv of [undefined, "development", "production", "test"]) {
    const env = {
      NODE_ENV: nodeEnv,
      ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED: "true",
    }
    assert.equal(api.googleBusinessWritesEnabled(env), true)
    assert.doesNotThrow(() => api.assertGoogleBusinessWrites(env))
  }
  const old = process.env.ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED
  process.env.ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED = "false"
  try {
    const noNetwork = () =>
      assert.fail("read-only writes must never reach the network")
    await assert.rejects(
      api.setGoogleBusinessHours(config, hoursInput(), "key", noNetwork),
      /read-only/
    )
    await assert.rejects(
      api.saveGoogleBusinessPost(config, postInput, "key", null, noNetwork),
      /read-only/
    )
    await assert.rejects(
      api.deleteGoogleBusinessPost(
        config,
        { target, id: record()._id, revision: "a".repeat(64) },
        "key",
        noNetwork
      ),
      /read-only/
    )
  } finally {
    if (old === undefined)
      delete process.env.ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED
    else process.env.ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED = old
  }
})
test("date ranges expand inclusively, retain unrelated holidays and restore regular hours", () => {
  const input = schemas.googleBusinessHoursInputSchema.parse(hoursInput())
  const hours = {
    regularHours: details.regularHours,
    specialHours: details.specialHours,
  }
  const body = api.googleBusinessHoursBody(hours, input)
  assert.equal(body.updateMask, "specialHours")
  assert.deepEqual(body.specialHours.specialHourPeriods, [
    special(5),
    special(26),
    special(27),
  ])
  const cleared = api.googleBusinessHoursBody(hours, {
    ...input,
    changes: [
      { starts_on: "2030-11-26", ends_on: "2030-11-26", kind: "regular" },
    ],
  })
  assert.deepEqual(cleared.specialHours.specialHourPeriods, [special(5)])
  const open = api.googleBusinessHoursBody(hours, {
    ...input,
    changes: [
      {
        starts_on: "2030-11-26",
        ends_on: "2030-11-26",
        kind: "open",
        opens_at: "11:00",
        closes_at: "16:30",
      },
    ],
  })
  assert.deepEqual(open.specialHours.specialHourPeriods[1].openTime, {
    hours: 11,
    minutes: 0,
  })
  assert.deepEqual(open.specialHours.specialHourPeriods[1].closeTime, {
    hours: 16,
    minutes: 30,
  })
  const overnight = {
    ...hours,
    specialHours: {
      specialHourPeriods: [
        { ...special(25), endDate: { year: 2030, month: 11, day: 26 } },
      ],
    },
  }
  assert.throws(() => api.googleBusinessHoursBody(overnight, input), /crosses/)
})
test("weekly conversion is Monday first and preserves split/overnight special hours", () => {
  const input = schemas.googleBusinessHoursInputSchema.parse({
    ...hoursInput(),
    changes: [],
    week: [
      { kind: "open", opens_at: "10:00", closes_at: "18:00" },
      ...Array(6).fill({ kind: "closed" }),
    ],
  })
  const result = api.googleBusinessHoursBody(
    { regularHours: details.regularHours, specialHours: details.specialHours },
    input
  )
  assert.equal(result.updateMask, "regularHours")
  assert.equal(result.regularHours.periods[0].openDay, "MONDAY")
  assert.deepEqual(result.regularHours.periods[0].openTime, {
    hours: 10,
    minutes: 0,
  })
  assert.equal(result.specialHours, undefined)
})
test("live Google TimeOfDay objects, omitted midnight zeros and split periods survive reads and merges", async () => {
  const untouched = {
    startDate: { year: 2030, month: 11, day: 5 },
    endDate: { year: 2030, month: 11, day: 5 },
    openTime: {},
    closeTime: { hours: 12, seconds: 30, nanos: 100 },
  }
  const location = {
    ...details,
    regularHours: {
      periods: [
        {
          openDay: "MONDAY",
          openTime: {},
          closeDay: "TUESDAY",
          closeTime: { hours: 24 },
        },
      ],
    },
    specialHours: {
      specialHourPeriods: [
        untouched,
        { ...untouched, openTime: { hours: 13 }, closeTime: { hours: 17 } },
        special(26),
      ],
    },
  }
  const current = await api.readGoogleBusinessLocation(
    config,
    target.account_id,
    mock({ location }).fetch
  )
  assert.deepEqual(current.hours.regularHours.periods[0].openTime, {})
  const body = api.googleBusinessHoursBody(
    current.hours,
    schemas.googleBusinessHoursInputSchema.parse(hoursInput())
  )
  assert.deepEqual(body.specialHours.specialHourPeriods[0], untouched)
  assert.deepEqual(body.specialHours.specialHourPeriods[1].closeTime, {
    hours: 17,
  })
})
test("hours schemas reject impossible, overlapping, unbounded and appointment dates", () => {
  const input = hoursInput()
  for (const changes of [
    [{ starts_on: "2030-02-30", ends_on: "2030-03-01", kind: "closed" }],
    [{ starts_on: "2030-11-27", ends_on: "2030-11-26", kind: "closed" }],
    [{ starts_on: "2030-01-01", ends_on: "2032-01-01", kind: "closed" }],
    [input.changes[0], input.changes[0]],
    [{ ...input.changes[0], kind: "appointment" }],
    [
      {
        ...input.changes[0],
        kind: "open",
        opens_at: "17:00",
        closes_at: "10:00",
      },
    ],
  ])
    assert.equal(
      schemas.googleBusinessHoursInputSchema.safeParse({ ...input, changes })
        .success,
      false
    )
  assert.equal(
    schemas.googleBusinessHoursInputSchema.safeParse({
      ...input,
      week: Array(7).fill({ kind: "appointment" }),
    }).success,
    false
  )
})
test("mock hours write targets only the selected location, guards stale revisions", () =>
  withWrites(async () => {
    const m = mock()
    await api.setGoogleBusinessHours(
      config,
      schemas.googleBusinessHoursInputSchema.parse(hoursInput()),
      "tune-stable-key",
      m.fetch
    )
    const write = m.calls.find((c) => c.method === "PUT")
    assert.equal(write.url.searchParams.get("locationId"), target.location_id)
    assert.equal(write.headers.get("Idempotency-Key"), "tune-stable-key")
    assert.equal(write.body.updateMask, "specialHours")
    for (const input of [
      { ...hoursInput(), revision: "a".repeat(64) },
      { ...hoursInput(), target: { ...target, location_id: "locations/999" } },
      { ...hoursInput(), target: { ...target, business: "Another business" } },
    ]) {
      const bad = mock()
      await assert.rejects(
        api.setGoogleBusinessHours(config, input, "key", bad.fetch),
        /changed/
      )
      assert(bad.calls.every((c) => c.method === "GET"))
    }
  }))
test("post reads exclude mixed accounts/platforms/locations and provider secrets", async () => {
  const m = mock({
    posts: [
      record({ accessToken: "secret" }),
      record({
        platforms: [{ platform: "instagram", accountId: target.account_id }],
      }),
      record({
        platforms: [
          {
            platform: "googlebusiness",
            accountId: "other",
            platformSpecificData: { locationId: target.location_id },
          },
        ],
      }),
      record({ platforms: [...record().platforms, ...record().platforms] }),
    ],
  })
  const result = await api.listGoogleBusinessPosts(
    config,
    target,
    undefined,
    10,
    m.fetch
  )
  assert.equal(result.posts.length, 1)
  assert(!JSON.stringify(result).includes("secret"))
  assert(m.calls.every((c) => c.method === "GET"))
})
test("mock draft, immediate and scheduled posts carry precise target, CTA, and idempotency", () =>
  withWrites(async () => {
    for (const when of ["draft", "now", "2030-11-01T12:00"]) {
      const scheduled = when.includes("T")
      // A fixed clock keeps store timezone conversion deterministic.
      const oldNow = Date.now
      Date.now = () => Date.parse("2030-11-01T12:00:00Z")
      try {
        const m = mock({
          post: record({
            status:
              when === "now" ? "published" : scheduled ? "scheduled" : "draft",
          }),
        })
        const input = schemas.googleBusinessPostInputSchema.parse({
          ...postInput,
          when,
          call_to_action: { type: "LEARN_MORE", url: "https://qaudio.com" },
        })
        const result = await api.saveGoogleBusinessPost(
          config,
          input,
          "stable-post-key",
          null,
          m.fetch
        )
        const write = m.calls.find((c) => c.method === "POST")
        assert.equal(write.headers.get("Idempotency-Key"), "stable-post-key")
        assert.equal(
          write.body.platforms[0].platformSpecificData.locationId,
          target.location_id
        )
        assert.equal(
          write.body.platforms[0].platformSpecificData.topicType,
          "STANDARD"
        )
        assert.equal(write.body.timezone, "America/New_York")
        if (scheduled)
          assert.equal(write.body.scheduledFor, "2030-11-01T16:00:00.000Z")
        else if (when === "draft") assert.equal(write.body.isDraft, true)
        else assert.equal(write.body.publishNow, true)
        assert.equal(result.live, when === "now")
      } finally {
        Date.now = oldNow
      }
    }
  }))
test("stale post, foreign post, published deletion, partial publish and provider errors fail safely", () =>
  withWrites(async () => {
    const post = record()
    const listed = await api.listGoogleBusinessPosts(
      config,
      target,
      undefined,
      10,
      mock({ post }).fetch
    )
    const revision = listed.posts[0].revision
    const good = mock({ post })
    await api.saveGoogleBusinessPost(
      config,
      { ...postInput, id: post._id, revision },
      "key",
      null,
      good.fetch
    )
    assert(good.calls.some((c) => c.method === "PUT"))
    const changed = mock({
      post: record({
        mediaItems: [
          { type: "image", url: "https://changed.example/image.jpg" },
        ],
      }),
    })
    await assert.rejects(
      api.saveGoogleBusinessPost(
        config,
        { ...postInput, id: post._id, revision },
        "key",
        null,
        changed.fetch
      ),
      /changed/
    )
    assert(changed.calls.every((c) => c.method === "GET"))
    const published = mock({ post: record({ status: "published" }) })
    const listedPublished = await api.listGoogleBusinessPosts(
      config,
      target,
      undefined,
      10,
      published.fetch
    )
    await assert.rejects(
      api.deleteGoogleBusinessPost(
        config,
        { target, id: post._id, revision: listedPublished.posts[0].revision },
        "key",
        published.fetch
      ),
      /can't be deleted/
    )
    for (const other of [
      record({ metadata: null }),
      record({
        platforms: [{ platform: "instagram", accountId: target.account_id }],
      }),
      record({
        platforms: [
          {
            ...record().platforms[0],
            platformSpecificData: { locationId: "locations/999" },
          },
        ],
      }),
    ]) {
      const foreign = mock({ post: other })
      await assert.rejects(
        api.saveGoogleBusinessPost(
          config,
          { ...postInput, id: post._id, revision },
          "key",
          null,
          foreign.fetch
        ),
        /only changes its own/
      )
      assert(foreign.calls.every((c) => c.method === "GET"))
    }
    const unverified = mock({
      location: { ...details, location: { isVerified: false } },
    })
    await assert.rejects(
      api.prepareGoogleBusinessPost(config, postInput, unverified.fetch),
      /not verified/
    )
    assert(unverified.calls.every((c) => c.method === "GET"))
    const partial = mock({ post: record({ status: "partial" }), status: 207 })
    await assert.rejects(
      api.saveGoogleBusinessPost(
        config,
        { ...postInput, when: "now" },
        "key",
        null,
        partial.fetch
      ),
      /did not publish/
    )
    await assert.rejects(
      api.saveGoogleBusinessPost(config, postInput, "key", null, async () => {
        throw new Error(config.apiKey)
      }),
      (error) => !error.message.includes(config.apiKey)
    )
    const del = mock()
    await api.deleteGoogleBusinessPost(
      config,
      { target, id: post._id, revision },
      "key",
      del.fetch
    )
    assert(del.calls.some((c) => c.method === "DELETE"))
  }))
test("post schemas and schedule windows reject unsafe content, targets, links and timing", () => {
  for (const change of [
    { content: "a".repeat(1501) },
    { content: " " },
    { target: { ...target, location_id: "locations/../999" } },
    { call_to_action: { type: "SHOP", url: "javascript:alert(1)" } },
    { id: record()._id },
    { when: "2030-02-30T12:00" },
    { when: "2030-03-10T02:30" },
  ])
    assert.equal(
      schemas.googleBusinessPostInputSchema.safeParse({
        ...postInput,
        ...change,
      }).success,
      false
    )
  const now = Date.parse("2030-11-01T12:00:00Z")
  assert(api.googleBusinessScheduleProblem("2030-10-01T12:00", now))
  assert(api.googleBusinessScheduleProblem("2030-12-01T12:00", now))
  assert.equal(api.googleBusinessScheduleProblem("2030-11-01T12:00", now), null)
})
test("Google approval choices preserve content and headings distinguish queued from published", () => {
  const tool = "save_google_business_post",
    now = "2030-11-01T10:00"
  assert.equal(choices.releaseTool("googlebusiness__save_post"), tool)
  const fields = choices.releaseFields(
    tool,
    postInput,
    "schedule",
    "2030-11-02T12:00",
    now
  )
  assert.deepEqual(fields, { when: "2030-11-02T12:00" })
  assert.equal(
    choices.withFields(tool, postInput, fields).content,
    postInput.content
  )
  const heading = (output) =>
    cardHeading({
      name: "googlebusiness__save_post",
      input: { ...postInput, when: "now" },
      output,
      label: "Saved the Google Business post",
      phase: "done",
      now,
    }).title
  assert.equal(heading({ status: "published" }), "Posted to Google Business")
  assert.equal(heading({ status: "pending" }), "Saved the Google Business post")
  const card = (callId, input) => ({
    role: "assistant",
    parts: [{ type: "tool", name: "googlebusiness__save_post", callId, input }],
  })
  const approved = {
    role: "user",
    parts: [
      {
        type: "text",
        text: choices.approvedMessage(tool, "now", { when: "now" }, null),
      },
    ],
  }
  const exact = choices.approvedProposals([
    card("1", postInput),
    approved,
    card("2", { ...postInput, when: "now" }),
  ])
  assert.deepEqual([...exact.approved], ["2"])
  for (const change of [
    { content: "Changed" },
    { target: { ...target, location_id: "locations/999" } },
    { call_to_action: { type: "SHOP", url: "https://qaudio.com" } },
  ]) {
    const result = choices.approvedProposals([
      card("1", postInput),
      approved,
      card("2", { ...postInput, when: "now", ...change }),
    ])
    assert.equal(result.approved.size, 0)
  }
})
