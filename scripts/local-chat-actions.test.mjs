import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import test from "node:test"

const stubs = {
  "next/server": "export const after = fn => globalThis.__chatAfter.push(fn)",
  "@/lib/admin/auth": "export const getAdmin = () => globalThis.__chatAdmin",
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
