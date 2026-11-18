// The Deals tab as the owner first sees it, rendered with React on the
// server: the table of deals with their kind, page, status, and dates, and
// the deal form with its products. Server Actions are stubbed.
import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const root = fileURLToPath(new URL("../", import.meta.url))
const stubs = {
  "server-only": "export {}",
  "next/server": "export const connection = async () => {}",
  "@/lib/supabase/server": "export const sessionSupabase = async () => ({})",
  "@/lib/supabase/public": "export const publicSupabase = () => {}",
  "next/navigation": "export const useRouter = () => ({ refresh() {} })",
  "next/image":
    "import { createElement } from 'react'; export default ({ fill, preload, ...props }) => createElement('img', props)",
  "next/link":
    "import { createElement } from 'react'; export default ({ prefetch, ...props }) => createElement('a', props)",
  "@/app/admin/deals/actions":
    "export const saveDealFromEditor = async () => ({}); export const saveDealTableEdits = async () => ({}); export const deleteDealFromAdmin = async () => ({})",
}
registerHooks({
  resolve(specifier, context, next) {
    if (stubs[specifier])
      return {
        url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
        shortCircuit: true,
      }
    if (context.parentURL?.startsWith("data:"))
      return next(specifier, { ...context, parentURL: import.meta.url })
    let candidate
    if (specifier.startsWith("@/"))
      candidate = resolve(root, specifier.slice(2))
    else if (
      specifier.startsWith(".") &&
      /\.(ts|tsx)$/.test(context.parentURL ?? "")
    )
      candidate = fileURLToPath(new URL(specifier, context.parentURL))
    if (candidate) {
      for (const suffix of ["", ".ts", ".tsx"])
        if (existsSync(candidate + suffix))
          return {
            url: pathToFileURL(candidate + suffix).href,
            shortCircuit: true,
          }
    }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (
      url.startsWith(pathToFileURL(root).href) &&
      !url.includes("/node_modules/")
    ) {
      if (url.endsWith(".css"))
        return {
          format: "module",
          source:
            "export default new Proxy({}, { get: (_, key) => typeof key === 'string' ? key : undefined })",
          shortCircuit: true,
        }
      if (url.endsWith(".tsx"))
        return {
          format: "module",
          shortCircuit: true,
          source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
            compilerOptions: {
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
              jsx: ts.JsxEmit.ReactJSX,
            },
          }).outputText,
        }
    }
    return next(url, context)
  },
})

const { DealsView } = await import("../components/admin/deals-view.tsx")
const { DealEditor } = await import("../components/admin/deal-editor.tsx")
const { valuesFromDeal } = await import("../lib/admin/deal-editor.ts")

const now = "2026-11-17T12:00"
const record = {
  id: "00000000-0000-4000-8000-000000000081",
  kind: "sale",
  title: "Bronze November",
  summary: "",
  note: "",
  status: "published",
  sort_order: 0,
  starts_at: "2026-11-01T00:00",
  ends_at: "2026-11-30T23:59",
  image: null,
  updated_at: "2026-11-01T00:00:00+00:00",
  items: [
    {
      brand: "McIntosh",
      name: "MC300",
      condition: "used",
      price_cents: 450000,
      product_id: null,
    },
  ],
}
const deal = (overrides = {}) => ({
  id: record.id,
  kind: record.kind,
  title: record.title,
  status: record.status,
  startsAt: record.starts_at,
  endsAt: record.ends_at,
  image: null,
  record,
  ...overrides,
})
const view = (deals, disabled = false) =>
  renderToStaticMarkup(
    createElement(DealsView, {
      deals,
      products: [],
      active: true,
      disabled,
      onTune() {},
      initialNow: now,
      sheet: null,
      onSheet() {},
      deleting: null,
      onDeleting() {},
    })
  )

test("the Deals tab lists every deal with its kind, page, status, and dates", () => {
  const html = view([
    deal(),
    deal({
      id: "00000000-0000-4000-8000-000000000082",
      kind: "qdeal",
      title: "Closeouts",
      status: "draft",
      startsAt: null,
      endsAt: null,
    }),
  ])
  for (const text of [
    "2 deals · 1 not live",
    "Bronze November",
    "Featured sale",
    "/sales",
    "Closeouts",
    "QDeal",
    "/qdeal",
    "Live",
    "No dates",
    "New deal",
    "Write with Tune",
    'aria-label="Edit Closeouts with Tune"',
    'aria-label="Delete Bronze November"',
    'aria-label="Status of Closeouts"',
  ])
    assert(html.includes(text), text)
  assert.match(html, /Nov 1, 2026 – Nov 30, 2026/)
  // Only Tune waits for the chat; direct editing never does.
  assert.equal(
    (view([deal()], true).match(/<button\b[^>]*\sdisabled=""/g) ?? []).length,
    2
  )
  assert(view([]).includes("No deals yet."))
})

test("the deal form shows where it goes, its dates, and its products", () => {
  const html = renderToStaticMarkup(
    createElement(DealEditor, {
      initial: valuesFromDeal(record),
      products: [],
      onSaved() {},
      onCancel() {},
      onDelete() {},
    })
  )
  for (const text of [
    "Shows on",
    "Featured sale",
    "/sales",
    "Starts",
    "Ends",
    "Image or flyer",
    'value="Bronze November"',
    'aria-label="Product 1: name"',
    'value="MC300"',
    'value="4500"',
    "Add product",
    "Closing note",
    "Delete deal",
  ])
    assert(html.includes(text), text)
})
