import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import test from "node:test"

const stubs = {
  "next/server": "export const after = fn => globalThis.__chatAfter.push(fn)",
  "@/lib/admin/auth": "export const getAdmin = () => globalThis.__chatAdmin",
  "@/lib/supabase/server":
    "export const sessionSupabase = () => globalThis.__currentChatDb",
  "@/lib/admin/current-chat":
    "export const currentChatInputSchema = { safeParse: input => globalThis.__currentChatSchema.safeParse(input) }; export const prepareCurrentChat = (db,input) => globalThis.__currentChatPrepare(db,input); export const resetCurrentChat = (db,input) => globalThis.__currentChatReset(db,input); export const recoverCurrentChat = (db,user,input) => globalThis.__currentChatRecover(db,user,input)",
  "@/lib/admin/local-chat-history":
    "export const localChatCleanupEnabled = () => process.env.NODE_ENV === 'development' && !process.env.VERCEL; export const pruneLocalChatHistory = input => globalThis.__chatPrune(input)",
}
registerHooks({
  resolve(specifier, context, next) {
    if (stubs[specifier])
      return {
        url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
        shortCircuit: true,
      }
    return next(specifier, context)
  },
})
const { cleanupLocalChatHistory } = await import("../app/admin/chat-actions.ts")
const id = `wrun_${"1".repeat(26)}`

test("cleanup action verifies the admin, validates IDs, and runs after the response", async (t) => {
  const old = { NODE_ENV: process.env.NODE_ENV, VERCEL: process.env.VERCEL }
  t.after(() => {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    delete globalThis.__chatAdmin
    delete globalThis.__chatAfter
    delete globalThis.__chatPrune
  })
  process.env.NODE_ENV = "development"
  delete process.env.VERCEL
  globalThis.__chatAfter = []
  globalThis.__chatAdmin = null
  globalThis.__chatPrune = () => assert.fail("unauthorized cleanup")
  await assert.rejects(cleanupLocalChatHistory(), /Sign in as an admin/)
  globalThis.__chatAdmin = { id: "test-admin" }
  await assert.rejects(
    cleanupLocalChatHistory({ endedSessionId: "../bad" }),
    /Invalid local chat/
  )
  await assert.rejects(
    cleanupLocalChatHistory({ appRoot: "../other" }),
    /Invalid local chat/
  )
  for (const mode of ["production", "hosted", "development"]) {
    process.env.NODE_ENV = mode === "production" ? "production" : "development"
    if (mode === "hosted") process.env.VERCEL = "1"
    else delete process.env.VERCEL
    globalThis.__chatAfter.length = 0
    const requests = []
    globalThis.__chatPrune = (input) => requests.push(input)
    await cleanupLocalChatHistory({ endedSessionId: id })
    assert.equal(requests.length, 0)
    assert.equal(globalThis.__chatAfter.length, mode === "development" ? 1 : 0)
    if (mode === "development") {
      await globalThis.__chatAfter[0]()
      assert.deepEqual(requests, [{ endedSessionId: id }])
      const warnings = []
      t.mock.method(console, "warn", (message) => warnings.push(message))
      globalThis.__chatPrune = () => {
        throw new Error("private provider details")
      }
      await globalThis.__chatAfter[0]()
      assert.equal(warnings.length, 1)
      assert(!warnings[0].includes("private provider details"))
    }
  }
})

test("current chat actions authorize every operation and validate revisions before touching Supabase", async (t) => {
  const { currentChatInputSchema } =
    await import("../lib/admin/current-chat.ts")
  const { prepareAdminChat, resetAdminChat, recoverAdminChat } =
    await import("../app/admin/chat-actions.ts")
  globalThis.__currentChatSchema = currentChatInputSchema
  const db = {}
  globalThis.__currentChatDb = db
  const calls = []
  globalThis.__currentChatPrepare = (...args) =>
    calls.push(["prepare", ...args])
  globalThis.__currentChatReset = (...args) => calls.push(["reset", ...args])
  globalThis.__currentChatRecover = (...args) =>
    calls.push(["recover", ...args])
  t.after(() => {
    for (const key of [
      "__chatAdmin",
      "__currentChatSchema",
      "__currentChatDb",
      "__currentChatPrepare",
      "__currentChatReset",
      "__currentChatRecover",
    ])
      delete globalThis[key]
  })
  const input = {
    generation: "00000000-0000-4000-8000-000000000081",
    sessionId: id,
  }
  for (const action of [prepareAdminChat, resetAdminChat, recoverAdminChat]) {
    globalThis.__chatAdmin = null
    await assert.rejects(action(input), /Sign in as an admin/)
    globalThis.__chatAdmin = { id: "owner" }
    await assert.rejects(
      action({ ...input, userId: "someone-else" }),
      /Invalid current chat/
    )
    await assert.rejects(
      action({ ...input, generation: "bad" }),
      /Invalid current chat/
    )
    await action(input)
  }
  assert.deepEqual(calls, [
    ["prepare", db, input],
    ["reset", db, input],
    ["recover", db, "owner", input],
  ])
})
