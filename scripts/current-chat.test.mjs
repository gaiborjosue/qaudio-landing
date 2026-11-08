import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import test from "node:test"

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "../lib/supabase" &&
      context.parentURL?.endsWith("/agent/hooks/current-chat.ts")
    )
      return {
        url: "data:text/javascript,export const callerSupabase = () => globalThis.__currentHookDb",
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
const chat = await import("../lib/admin/current-chat.ts")
const { default: hook } = await import("../agent/hooks/current-chat.ts")
const generation = "00000000-0000-4000-8000-000000000081"
const newer = "00000000-0000-4000-8000-000000000082"
const session = `wrun_${"1".repeat(26)}`
const other = `wrun_${"2".repeat(26)}`

function client(state = { generation, session_id: session }) {
  const calls = []
  let next = state
  let failure = null
  const db = {
    calls,
    set(value) {
      next = value
    },
    fail(error) {
      failure = error
    },
    async rpc(name, input) {
      calls.push([name, input])
      return { data: next ? [next] : null, error: failure }
    },
    from(table) {
      const query = {
        select(columns) {
          calls.push([table, columns])
          return query
        },
        eq(...args) {
          calls.push(args)
          return query
        },
        async maybeSingle() {
          return { data: next, error: failure }
        },
      }
      return query
    },
  }
  return db
}

test("same-account devices read the saved pointer without creating a session", async () => {
  const db = client()
  assert.deepEqual(await chat.readCurrentChat(db, "admin-a"), {
    generation,
    session_id: session,
  })
  assert.deepEqual(db.calls[0], [
    "admin_chat_sessions",
    "session_id, generation",
  ])
  assert(
    db.calls.some((call) => call[0] === "user_id" && call[1] === "admin-a")
  )
  assert.equal(
    db.calls.some((call) => call[0] === "admin_chat_session"),
    false
  )
})

test("first messages reserve a revision, while stale devices cannot create another current chat", async () => {
  const db = client({ generation, session_id: null })
  assert.equal(
    (await chat.prepareCurrentChat(db, { generation: null, sessionId: null }))
      .generation,
    generation
  )
  assert.equal(db.calls[0][1].p_event, "prepare")
  db.set({ generation, session_id: session })
  assert.equal(
    (await chat.prepareCurrentChat(db, { generation, sessionId: session }))
      .session_id,
    session
  )
  for (const input of [
    { generation, sessionId: null },
    { generation, sessionId: other },
    { generation: newer, sessionId: session },
  ])
    await assert.rejects(
      chat.prepareCurrentChat(db, input),
      /changed on another device/
    )
  db.set({ generation: newer, session_id: null })
  await assert.rejects(
    chat.prepareCurrentChat(db, { generation, sessionId: session }),
    /changed on another device/
  )
})

test("failed history restoration clears only its own revision and follows a newer device's chat", async () => {
  const db = client()
  await chat.recoverCurrentChat(db, "admin-a", {
    generation,
    sessionId: session,
  })
  assert.equal(db.calls.at(-1)[1].p_event, "reset")
  assert.equal(db.calls.at(-1)[1].p_generation, generation)
  const changed = client({ generation: newer, session_id: other })
  assert.deepEqual(
    await chat.recoverCurrentChat(changed, "admin-a", {
      generation,
      sessionId: session,
    }),
    { generation: newer, session_id: other }
  )
  assert.equal(
    changed.calls.some((call) => call[0] === "admin_chat_session"),
    false
  )
  // A failed pointer read cannot erase a chat claimed by another device.
  const unknown = client()
  assert.deepEqual(
    await chat.recoverCurrentChat(unknown, "admin-a", {
      generation: null,
      sessionId: null,
    }),
    { generation, session_id: session }
  )
  assert.equal(
    unknown.calls.some((call) => call[0] === "admin_chat_session"),
    false
  )
  const raced = client({ generation, session_id: null })
  raced.rpc = async () => {
    raced.set({ generation, session_id: other })
    return { data: null, error: { code: "P0001" } }
  }
  assert.deepEqual(
    await chat.recoverCurrentChat(raced, "admin-a", {
      generation,
      sessionId: null,
    }),
    { generation, session_id: other }
  )
  const missing = client(null)
  // RPC reset initializes a blank pointer after a read failure/no saved record.
  const rpc = missing.rpc
  missing.rpc = async (...args) => {
    missing.set({ generation: newer, session_id: null })
    return rpc(...args)
  }
  assert.equal(
    (
      await chat.recoverCurrentChat(missing, "admin-a", {
        generation: null,
        sessionId: null,
      })
    ).session_id,
    null
  )
})

test("production, preview branches and local PCs use distinct stable namespaces", () => {
  const scope = chat.currentChatEnvironment
  assert.equal(scope({ NODE_ENV: "production" }), "production")
  assert.equal(scope({ ADMIN_CHAT_ENVIRONMENT: "sandbox" }), "sandbox")
  assert.notEqual(
    scope({ NODE_ENV: "development" }, "C:/dev/a"),
    scope({ NODE_ENV: "development" }, "C:/dev/b")
  )
  assert.equal(
    scope({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature",
      VERCEL_URL: "build-a",
    }),
    scope({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "feature",
      VERCEL_URL: "build-b",
    })
  )
  assert.notEqual(
    scope({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "a" }),
    scope({ VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "b" })
  )
  assert.throws(
    () => scope({ ADMIN_CHAT_ENVIRONMENT: "../../ bad" }),
    /Invalid/
  )
})

test("agent lifecycle persists before domain work, rejects stale revisions and ignores children", async (t) => {
  const db = client()
  globalThis.__currentHookDb = db
  t.after(() => delete globalThis.__currentHookDb)
  const context = {
    session: {
      id: session,
      auth: {
        current: {
          principalType: "user",
          attributes: { [chat.CHAT_GENERATION_ATTRIBUTE]: generation },
        },
      },
    },
  }
  await hook.events["session.started"]({}, context)
  await hook.events["turn.started"]({}, context)
  assert.equal(db.calls.length, 2)
  assert.equal(db.calls[0][1].p_session_id, session)
  assert.equal(db.calls[0][1].p_generation, generation)
  assert.equal(db.calls[0][1].p_event, "claim")
  await hook.events["turn.started"](
    {},
    { session: { ...context.session, parent: {} } }
  )
  assert.equal(db.calls.length, 2)
  db.fail({ code: "P0001", message: "private provider details" })
  await assert.rejects(
    hook.events["turn.started"]({}, context),
    /changed on another device/
  )
  assert.equal(
    hook.events["session.ended"],
    undefined,
    "browser closure or timeout never silently rotates the current chat"
  )
})
