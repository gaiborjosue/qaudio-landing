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
  "next/navigation": "export const useRouter = () => ({ refresh() {} })",
  "next/image":
    "import { createElement } from 'react'; export default ({ fill, preload, ...props }) => createElement('img', props)",
  "next/link":
    "import { createElement } from 'react'; export default ({ prefetch, ...props }) => createElement('a', props)",
  "@/app/admin/news/actions":
    "export const saveNewsFromEditor = async () => ({}); export const saveNewsTableEdits = async () => ({}); export const deleteNewsFromAdmin = async () => ({})",
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

const { filterNews, newsChatMessage, newsStatus } =
  await import("../lib/admin/news.ts")
const { getAdminNews } = await import("../lib/admin/data.ts")
const { NewsView } = await import("../components/admin/news-view.tsx")
const {
  blocksToMarkdown,
  inputFromNews,
  markdownToBlocks,
  parseInline,
  valuesFromNews,
} = await import("../lib/admin/news-editor.ts")
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
    cover_path: i === 0 ? null : "news/cover.webp",
  }))
  const calls = []
  globalThis.__newsDb = {
    from(table) {
      assert.equal(table, "news_posts")
      const query = {
        select(columns) {
          assert.equal(
            columns,
            "id, slug, title, status, published_at, cover_path"
          )
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
  assert.deepEqual(result[0], {
    ...post("0", "draft", null, "News"),
    hasCover: false,
  })
  assert.equal(result[400].publishedAt, now)
  assert.equal(result[400].hasCover, true)
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

test("news table renders every post with direct edit, status, Tune, and delete", () => {
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
  assert.equal((html.match(/title="Edit with Tune"/g) ?? []).length, posts.length)
  assert.equal((html.match(/aria-label="Edit [^"]*"/g) ?? []).length, posts.length * 2)
  assert.equal((html.match(/aria-label="Delete /g) ?? []).length, posts.length)
  assert.equal((html.match(/aria-label="Status of /g) ?? []).length, posts.length)
  assert(html.includes("Write with Tune"))
  assert(html.includes("New post"))
  assert(html.includes("5 posts · 3 not live"))
  assert(html.includes("Scheduled"))
  assert(html.includes("Draft"))
  assert(html.includes("Published"))
  assert(html.includes("/news/post-live"))
  assert.match(html, /datetime="2026-11-07T12:00"/i)
  assert(html.includes('aria-label="Edit Listening night with Tune"'))
  assert(!html.includes("linear-gradient"))
  // Only Tune waits for the chat; direct editing never does.
  assert.equal(
    (render(posts, true).match(/<button\b[^>]*\sdisabled=""/g) ?? []).length,
    posts.length + 1
  )
  assert(render([]).includes("No news posts yet."))
})

test("news Markdown round-trips every block type and escapes literal markers", () => {
  const body = [
    {
      type: "paragraph",
      content: [
        "Doors at 7, ",
        { text: "bring vinyl", strong: true },
        " and see ",
        { text: "the [map]", href: "/visit" },
        ". 2 * 3 \\ done",
      ],
    },
    { type: "heading", text: "What to expect" },
    {
      type: "list",
      items: [["Tubes"], [{ text: "Free coffee", strong: true }, "\nall night"]],
    },
    { type: "quote", text: "Best night.\nTruly." },
    {
      type: "image",
      image: { src: "news/room.webp", width: 1600, height: 900, alt: "The room [lit]" },
      caption: 'Shot "live"',
    },
    { type: "paragraph", content: ["# not a heading\n- not a list"] },
  ]
  const markdown = blocksToMarkdown(body)
  const photos = { "news/room.webp": { width: 1600, height: 900 } }
  assert.deepEqual(markdownToBlocks(markdown, photos), { blocks: body, problem: undefined })
  assert.match(markdown, /^## What to expect$/m)
  assert.match(markdown, /^!\[The room \[lit\\]\]\(news\/room\.webp "Shot \\"live\\""\)$/m)
})

test("news Markdown keeps unsafe links as text and flags photos it can't save", () => {
  assert.deepEqual(parseInline("see [it](javascript:alert(1)) now"), [
    "see [it](javascript:alert(1)) now",
  ])
  assert.deepEqual(parseInline("**bold [link](https://q.audio)**"), [
    { text: "bold ", strong: true },
    { text: "link", strong: true, href: "https://q.audio" },
  ])
  assert.equal(markdownToBlocks("![A](uploads/x.webp)", {}).problem, "photo-size")
  assert.equal(
    markdownToBlocks("![](uploads/x.webp)", {
      "uploads/x.webp": { width: 1, height: 1 },
    }).problem,
    "photo-alt"
  )
})

test("the post form saves an untouched article exactly and publishes now without a date", () => {
  const record = {
    id: "8b0c4b9e-4f40-4bb8-9c43-5f0f2c1b7a11",
    slug: "listening-night",
    title: "Listening night",
    body: [{ type: "paragraph", content: ["Hi ", { text: "there", strong: false }] }],
    cover: { path: "news/c.webp", width: 10, height: 10, alt: "Room", fit: "cover" },
    status: "draft",
    published_at: null,
  }
  const values = valuesFromNews(record)
  assert.deepEqual(values.photos, { "news/c.webp": { width: 10, height: 10 } })
  const untouched = inputFromNews({ ...values, title: " New " }, record).input
  assert.equal(untouched.body, record.body)
  assert.equal(untouched.title, "New")
  assert.equal(untouched.published_at, null)
  const published = inputFromNews({ ...values, status: "published" }, record)
  assert.equal(published.input.published_at, "now")
  const scheduled = inputFromNews(
    { ...values, status: "published", publishedAt: "2026-12-01T09:00" },
    record
  )
  assert.equal(scheduled.input.published_at, "2026-12-01T09:00")
  const edited = inputFromNews({ ...values, body: "Hi **there**" }, record)
  assert.deepEqual(edited.input.body, [
    { type: "paragraph", content: ["Hi ", { text: "there", strong: true }] },
  ])
})

test("News tab writes check the admin, validate, and refresh the news cache", () => {
  const source = (path) =>
    readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
  const actions = source("app/admin/news/actions.ts")
  const route = source("app/api/admin/news/route.ts")
  for (const name of ["saveNewsFromEditor", "saveNewsTableEdits", "deleteNewsFromAdmin"]) {
    const body = actions.split(`export async function ${name}`)[1].split("\nexport ")[0]
    assert.match(body, /if \(!\(await getAdmin\(\)\)\)/, name)
    assert.match(body, /\.safeParse\(/, name)
    assert.match(body, /await sessionSupabase\(\)/, name)
    assert.match(body, /updateTag\(NEWS_CACHE_TAG\)/, name)
  }
  assert.match(route, /status: 401/)
  assert.match(route, /private, no-store/)
  assert.match(route, /readNewsPost\(\s*await sessionSupabase\(\)/)
})

test("admin dates use the site calendar and clock, never the browser's pickers", async () => {
  const { DateTimePicker } = await import("../components/admin/date-time-picker.tsx")
  const render = (value) =>
    renderToStaticMarkup(
      createElement(DateTimePicker, {
        id: "published",
        label: "Publication",
        placeholder: "Not set",
        value,
        onChange() {},
      })
    )
  const set = render("2026-11-08T09:05")
  assert.match(set, /<button[^>]*id="published"/)
  assert(set.includes("Nov 8, 2026, 9:05"))
  assert(render("").includes("Not set"))
  const { readdirSync } = await import("node:fs")
  const dir = new URL("../components/admin/", import.meta.url)
  for (const name of readdirSync(dir).filter((file) => file.endsWith(".tsx")))
    assert.doesNotMatch(
      readFileSync(new URL(name, dir), "utf8"),
      /type="(datetime-local|date|time)"/,
      name
    )
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
