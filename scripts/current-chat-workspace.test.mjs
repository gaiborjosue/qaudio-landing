import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const stubs = {
  "@/components/admin/admin-shell": "export const AdminShell = () => null",
  "@/lib/admin/data":
    "export const getAdminDeals = async () => []; export const getAdminNews = async () => []; export const getAdminProducts = async () => []; export const getAdminSchedule = async () => ({}); export const getAdminMetadata = async () => ({})",
  "@/lib/admin/auth":
    "export const requireAdmin = async () => ({ id: 'signed-in-admin' })",
  "@/lib/catalog-data":
    "export const getCatalogTaxonomy = async () => ({categories:[], brands:[]})",
  "@/lib/admin/store-time":
    "export const toStoreDateTime = () => '2026-11-08T00:24'",
  "@/lib/admin/current-chat":
    "export const readCurrentChat = (db, user) => globalThis.__workspaceCurrentChat(db, user)",
  "@/lib/supabase/server":
    "export const sessionSupabase = async () => globalThis.__workspaceDb",
  "next/navigation":
    "export const redirect = href => { throw Object.assign(new Error('redirect'), { href }) }",
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
  load(url, context, next) {
    if (url.endsWith("/components/admin/admin-workspace.tsx"))
      return {
        format: "module",
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
          compilerOptions: {
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
          },
          fileName: fileURLToPath(url),
        }).outputText,
      }
    return next(url, context)
  },
})
const { AdminWorkspace } =
  await import("../components/admin/admin-workspace.tsx")
const session = `wrun_${"1".repeat(26)}`
const generation = "00000000-0000-4000-8000-000000000081"

test("opening /admin on another device redirects to the signed-in admin's existing chat", async (t) => {
  const db = {}
  globalThis.__workspaceDb = db
  const calls = []
  globalThis.__workspaceCurrentChat = async (...args) => {
    calls.push(args)
    return { session_id: session, generation }
  }
  t.after(() => {
    delete globalThis.__workspaceCurrentChat
    delete globalThis.__workspaceDb
  })
  await assert.rejects(
    AdminWorkspace({}),
    (error) => error.href === `/admin/s/${session}`
  )
  assert.deepEqual(calls, [[db, "signed-in-admin"]])
  const existing = await AdminWorkspace({ sessionId: Promise.resolve(session) })
  assert.equal(existing.props.sessionId, session)
  assert.equal(existing.props.chatGeneration, generation)
  assert.equal(existing.props.chatRestoreFailed, false)
  const products = await AdminWorkspace({ view: "products" })
  assert.equal(products.props.sessionId, session)
  assert.equal(products.props.initialView, "products")
  const news = await AdminWorkspace({ view: "news" })
  assert.equal(news.props.sessionId, session)
  assert.equal(news.props.chatGeneration, generation)
  assert.equal(news.props.initialView, "news")
  assert.equal(news.props.newsNow, "2026-11-08T00:24")
})

test("failed saved-pointer loads render a fresh chat rather than the error boundary", async (t) => {
  globalThis.__workspaceCurrentChat = async () => {
    throw new Error("database unavailable")
  }
  t.after(() => delete globalThis.__workspaceCurrentChat)
  const fresh = await AdminWorkspace({})
  assert.equal(fresh.props.sessionId, undefined)
  assert.equal(fresh.props.chatGeneration, null)
  assert.equal(fresh.props.chatRestoreFailed, true)
  globalThis.__workspaceCurrentChat = async () => null
  const firstVisit = await AdminWorkspace({})
  assert.equal(firstVisit.props.sessionId, undefined)
  assert.equal(firstVisit.props.chatRestoreFailed, false)
})
