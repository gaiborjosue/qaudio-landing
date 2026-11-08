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
  "@/lib/supabase/server":
    "export const sessionSupabase = async () => globalThis.__newsDb",
  "@/lib/supabase/public": "export const publicSupabase = () => {}",
}
registerHooks({
  resolve(specifier, context, next) {
    if (stubs[specifier])
      return {
        url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
        shortCircuit: true,
      }
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
          source: "export default {}",
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

const { filterNews, newsChatMessage, newsStatus } =
  await import("../lib/admin/news.ts")
const { getAdminNews } = await import("../lib/admin/data.ts")
const { NewsView } = await import("../components/admin/news-view.tsx")
const now = "2026-11-07T12:00"
const post = (id, status, publishedAt, title = "Listening night") => ({
  id,
  slug: `post-${id}`,
  title,
  status,
  publishedAt,
})
const posts = [
  post("draft", "draft", null),
  post("dated-draft", "draft", "2026-11-08T12:00"),
  post("scheduled", "published", "2026-11-07T12:01"),
  post("live", "published", now),
  post("old", "published", "2026-11-06T12:00", "Café opening"),
]

test("news visibility uses status and the exact store-time publication boundary", () => {
  assert.deepEqual(
    posts.map((item) => newsStatus(item, now)),
    ["draft", "draft", "scheduled", "published", "published"]
  )
  assert.equal(newsStatus(posts[2], "2026-11-07T12:01"), "published")
  assert.equal(newsStatus(post("undated", "published", null), now), "draft")
})

test("search matches titles and slugs, with combined status filters", () => {
  assert.deepEqual(filterNews(posts, "", "all", now), posts)
  assert.deepEqual(filterNews(posts, "", "draft", now), posts.slice(0, 2))
  assert.deepEqual(filterNews(posts, "", "scheduled", now), [posts[2]])
  assert.deepEqual(filterNews(posts, "  CAFE  ", "published", now), [posts[4]])
  assert.deepEqual(filterNews(posts, "POST-LIVE", "all", now), [posts[3]])
  assert.deepEqual(filterNews(posts, "Listening", "published", now), [posts[3]])
  assert.deepEqual(filterNews(posts, "Café", "draft", now), [])
})

test("Tune handoff identifies the selected post even when titles are identical", () => {
  assert.equal(
    newsChatMessage(posts[0]),
    "I want to edit the news post “Listening night”.\nItem: news_post draft"
  )
  assert.equal(
    newsChatMessage(posts[2]),
    "I want to edit the news post “Listening night”.\nItem: news_post scheduled"
  )
  assert.equal(newsChatMessage(), "I want to create a news post.")
})

test("admin news loads beyond 200 rows through the session and keeps drafts", async () => {
  const rows = Array.from({ length: 401 }, (_, i) => ({
    id: String(i),
    slug: `post-${i}`,
    title: "News",
    status: i === 0 ? "draft" : "published",
    published_at: i === 0 ? null : "2026-11-07T17:00:00Z",
  }))
  const calls = []
  globalThis.__newsDb = {
    from(table) {
      assert.equal(table, "news_posts")
      const query = {
        select(columns) {
          assert.equal(columns, "id, slug, title, status, published_at")
          return query
        },
        order(...args) {
          calls.push(["order", ...args])
          return query
        },
        range(from, to) {
          calls.push(["range", from, to])
          return Promise.resolve({
            data: rows.slice(from, to + 1),
            error: null,
          })
        },
      }
      return query
    },
  }
  const result = await getAdminNews()
  assert.equal(result.length, 401)
  assert.deepEqual(result[0], post("0", "draft", null, "News"))
  assert.equal(result[400].publishedAt, now)
  assert.deepEqual(
    calls.filter(([kind]) => kind === "range"),
    [
      ["range", 0, 199],
      ["range", 200, 399],
      ["range", 400, 599],
    ]
  )
  assert(calls.some(([kind, column]) => kind === "order" && column === "id"))
})

test("admin news surfaces database failures rather than showing a partial collection", async () => {
  globalThis.__newsDb = {
    from() {
      const query = {
        select() {
          return query
        },
        order() {
          return query
        },
        range() {
          return Promise.resolve({
            data: null,
            error: { message: "Read failed" },
          })
        },
      }
      return query
    },
  }
  await assert.rejects(getAdminNews(), /Admin news: Read failed/)
})

test("news table renders every post with semantic headers and monochrome Tune actions", () => {
  const render = (items, disabled = false) =>
    renderToStaticMarkup(
      createElement(NewsView, {
        posts: items,
        initialNow: now,
        active: true,
        disabled,
        onTune() {},
      })
    )
  const html = render(posts)
  assert.equal((html.match(/scope="col"/g) ?? []).length, 4)
  assert.equal((html.match(/scope="row"/g) ?? []).length, posts.length)
  assert.equal((html.match(/Edit with Tune/g) ?? []).length, posts.length)
  assert(html.includes("5 of 5 posts"))
  assert(html.includes("Scheduled"))
  assert(html.includes("Draft"))
  assert(html.includes("Published"))
  assert(html.includes("/news/post-live"))
  assert.match(html, /datetime="2026-11-07T12:00"/i)
  assert(html.includes('aria-label="Edit “Listening night” with Tune"'))
  assert(html.includes('aria-label="News posts" tabindex="0"'))
  assert(!html.includes("linear-gradient"))
  assert.equal(
    (render(posts, true).match(/<button\b[^>]*\sdisabled=""/g) ?? []).length,
    posts.length + 1
  )
  assert(render([]).includes("No news posts yet."))
})

test("News is next to Chat, reloadable, and stays mounted during exact-item handoff", () => {
  const source = (path) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const shell = source("components/admin/admin-shell.tsx")
  const chat = source("components/admin/admin-chat.tsx")
  const route = source("app/admin/news/page.tsx")
  assert.match(shell, /id: "chat"[\s\S]*?id: "news"[\s\S]*?id: "products"/)
  assert.match(shell, /show\("chat"\)\s+newsChat\(post\)/)
  assert.match(shell, /hidden=\{view !== "news"\}/)
  assert.match(shell, /History\.prototype\.replaceState/)
  assert.match(chat, /send\(newsChatMessage\(post\)\)/)
  assert.match(chat, /if \(newsSending\.current\) return/)
  assert.match(chat, /busy \|\| resuming \|\| ending \|\| startingNews/)
  assert.match(chat, /return \(\) => onNewsChatReady\(null\)/)
  assert.match(route, /<Suspense[\s\S]*<AdminWorkspace view="news"/)
})
