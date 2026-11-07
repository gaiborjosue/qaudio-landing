import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "../lib/supabase" &&
      context.parentURL?.endsWith("/agent/tools/hours__save_hours_change.ts")
    )
      return {
        url: "data:text/javascript,export const callerSupabase=()=>globalThis.cacheTestClient; export const failure=()=>new Error('save failed');",
        shortCircuit: true,
      }
    if (
      specifier.startsWith(".") &&
      context.parentURL?.endsWith(".ts") &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      const file = fileURLToPath(new URL(`${specifier}.ts`, context.parentURL))
      if (existsSync(file))
        return { url: pathToFileURL(file).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})

const { ChatCacheRefresh, siteCacheTags } =
  await import("../lib/admin/site-cache.ts")
const { revalidationRequest } =
  await import("../lib/admin/site-revalidation.ts")
const { refreshAfterSave, siteOrigin } =
  await import("../agent/lib/site-cache.ts")
const { default: saveHours } =
  await import("../agent/tools/hours__save_hours_change.ts")
const caller = {
  session: {
    auth: {
      current: {
        principalType: "user",
        attributes: { supabaseAccessToken: "admin-token" },
      },
    },
  },
}
const event = (id, tags = ["news"], outcome = "completed") => ({
  type: "call.settled",
  data: { callId: id, outcome, output: { revalidate: tags } },
})
const request = (body = { tags: ["news"] }, token = "admin-token") =>
  new Request("https://site.example/api/admin/revalidate", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  })

test("cache callbacks require an admin and reject unknown tags without invalidating anything", async () => {
  const invalidated = []
  const deps = {
    verify: async (token) =>
      token === "admin-token"
        ? {}
        : token === "ordinary-user"
          ? "forbidden"
          : "invalid",
    revalidate: (tag) => invalidated.push(tag),
  }
  for (const [token, status] of [
    [null, 401],
    ["expired", 401],
    ["ordinary-user", 403],
  ])
    assert.equal(
      (await revalidationRequest(request(undefined, token), deps)).status,
      status
    )
  for (const body of [
    null,
    {},
    { tags: [] },
    { tags: ["news", "private"] },
    { tags: ["news"], extra: true },
    { tags: Array(5).fill("news") },
  ])
    assert.equal((await revalidationRequest(request(body), deps)).status, 400)
  assert.deepEqual(invalidated, [])
  const response = await revalidationRequest(
    request({ tags: ["news", "news", "catalog"] }),
    deps
  )
  assert.equal(response.status, 204)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.deepEqual(invalidated, ["news", "catalog"])
})

test("callback failures are retryable and never disclose provider errors", async () => {
  const response = await revalidationRequest(request(), {
    verify: async () => {
      throw new Error("private credentials")
    },
    revalidate: () => assert.fail("not authenticated"),
  })
  assert.equal(response.status, 503)
  assert.equal(await response.text(), "")
})

test("only server configuration chooses the callback origin; Eve's PORT is ignored", () => {
  assert.equal(siteOrigin({ PORT: "4274" }), "http://localhost:3000")
  assert.equal(
    siteOrigin({ VERCEL_URL: "deployment.vercel.app" }),
    "https://deployment.vercel.app"
  )
  assert.equal(
    siteOrigin({ SITE_ORIGIN: "http://localhost:3001", VERCEL_URL: "ignored" }),
    "http://localhost:3001"
  )
  for (const origin of [
    "http://external.example",
    "https://user:password@site.example",
    "https://site.example/path",
    "https://site.example?token=x",
    "https://site.example#x",
    "file:///tmp",
  ])
    assert.throws(() => siteOrigin({ SITE_ORIGIN: origin }))
})

test("an approved save invalidates Next without any browser or onFinish callback", async (t) => {
  const writes = []
  const invalidated = []
  const priorOrigin = process.env.SITE_ORIGIN
  process.env.SITE_ORIGIN = "https://site.example"
  t.after(() => {
    if (priorOrigin === undefined) delete process.env.SITE_ORIGIN
    else process.env.SITE_ORIGIN = priorOrigin
    delete globalThis.cacheTestClient
  })
  globalThis.cacheTestClient = {
    from: (table) => ({
      insert: (row) => {
        writes.push([table, row])
        return {
          select: async () => ({ data: [{ id: "saved-change" }], error: null }),
        }
      },
    }),
  }
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(writes.length, 1)
    assert.equal(url.href, "https://site.example/api/admin/revalidate")
    assert.equal(options.redirect, "error")
    assert(options.signal instanceof AbortSignal)
    return revalidationRequest(new Request(url, options), {
      verify: async (token) => {
        assert.equal(token, "admin-token")
        return {}
      },
      revalidate: (tag) => invalidated.push(tag),
    })
  })
  const saved = await saveHours.execute(
    {
      starts_on: "2026-11-08",
      ends_on: "2026-11-08",
      kind: "closed",
      note: "",
      id: undefined,
    },
    caller
  )
  assert.equal(saved.saved, true)
  assert.equal(saved.cacheRefresh, "complete")
  assert.deepEqual(invalidated, ["store-hours"])
  assert.equal(writes.length, 1)
})

test("only invalidation retries; a saved write survives callback failure with a safe warning", async (t) => {
  let attempts = 0
  t.mock.method(globalThis, "fetch", async () => {
    attempts++
    if (attempts === 1) throw new Error("lost callback response")
    return new Response(null, { status: 204 })
  })
  const saved = { saved: true, id: "committed", revalidate: ["news"] }
  assert.equal((await refreshAfterSave(caller, saved)).cacheRefresh, "complete")
  assert.equal(attempts, 2)
  attempts = 0
  t.mock.method(globalThis, "fetch", async () => {
    attempts++
    return new Response(null, { status: 503 })
  })
  t.mock.method(console, "warn", () => {})
  const pending = await refreshAfterSave(caller, saved)
  assert.equal(pending.saved, true)
  assert.equal(pending.id, "committed")
  assert.equal(pending.cacheRefresh, "pending")
  assert.match(pending.cacheWarning, /do not repeat the save/)
  assert.equal(attempts, 3)
  assert.deepEqual(pending.revalidate, ["news"])
})

test("replayed calls refresh without onFinish; failures remain pending and concurrent flushes share a request", async () => {
  const refresh = new ChatCacheRefresh()
  refresh.observe(event("failed", ["news"], "failed"))
  refresh.observe(event("unknown", ["private"]))
  refresh.observe(event("saved", ["news", "news", "private"]))
  refresh.observe(event("saved"))
  let attempts = 0
  await assert.rejects(
    refresh.flush(async (tags) => {
      assert.deepEqual(tags, ["news"])
      attempts++
      throw new Error("connection lost")
    })
  )
  const pending = Promise.withResolvers()
  const first = refresh.flush(async (tags) => {
    assert.deepEqual(tags, ["news"])
    attempts++
    await pending.promise
  })
  assert.equal(
    refresh.flush(() => assert.fail("duplicate refresh")),
    first
  )
  pending.resolve()
  assert.equal(await first, true)
  refresh.observe(event("saved"))
  assert.equal(
    await refresh.flush(() => assert.fail("already refreshed")),
    false
  )
  assert.equal(attempts, 2)
  assert.deepEqual(siteCacheTags(["news", "private", 42, "news"]), ["news"])
})
