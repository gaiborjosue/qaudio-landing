import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

// Agent code imports lib/ without extensions, as its bundler allows.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const file = fileURLToPath(new URL(`${specifier}.ts`, context.parentURL))
      if (existsSync(file))
        return { url: pathToFileURL(file).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})

const { LIST_TOOL, listText, productSlug, showListInputSchema } =
  await import("../lib/admin/show-list.ts")
const { default: showList } = await import("../agent/tools/show_list.ts")

const sale = {
  title: "On sale until Jan 4",
  items: [
    {
      title: "Paradigm Essentials Sub 10",
      value: "$439.99",
      was: "$549.99",
      href: "/products/paradigm-essentials-sub-10",
    },
    {
      title: "Paradigm Monitor SE Atom",
      value: "$299.99",
      was: "$399.98",
      tags: ["Pair"],
    },
    { title: "Bronze November", detail: "Oct 31 to Nov 29", tags: ["Live"] },
  ],
}

test("show_list takes any list of comparable rows", () => {
  assert.equal(LIST_TOOL, "show_list")
  assert(showListInputSchema.safeParse(sale).success)
  assert(showListInputSchema.safeParse({ items: [{ title: "Hours" }] }).success)
  for (const bad of [
    { items: [] },
    { items: [{ title: " " }] },
    { items: [{ title: "x", href: "https://example.com" }] },
    { items: [{ title: "x", href: "//example.com/a" }] },
    { items: [{ title: "x", tags: ["a", "b", "c", "d"] }] },
    { items: Array.from({ length: 31 }, () => ({ title: "x" })) },
  ])
    assert(!showListInputSchema.safeParse(bad).success, JSON.stringify(bad))
})

test("product links resolve to their slug, other pages don't", () => {
  assert.equal(
    productSlug("/products/paradigm-essentials-sub-10"),
    "paradigm-essentials-sub-10"
  )
  assert.equal(productSlug("/news/winter-sale"), undefined)
  assert.equal(productSlug(undefined), undefined)
})

test("a shown list copies as Markdown", () => {
  assert.equal(
    listText(sale),
    [
      "**On sale until Jan 4**",
      "- Paradigm Essentials Sub 10: ~~$549.99~~ → $439.99",
      "- Paradigm Monitor SE Atom: ~~$399.98~~ → $299.99 (Pair)",
      "- Bronze November (Oct 31 to Nov 29 · Live)",
    ].join("\n")
  )
})

test("the model gets one word back, not its list again", async () => {
  assert.equal(showList.deferred, undefined)
  assert.equal(showList.availableInSubagents, false)
  assert.equal(showList.approval, undefined)
  const output = await showList.execute(sale, {})
  assert.deepEqual(output, { shown: 3 })
  assert.deepEqual(await showList.toModelOutput(output), {
    type: "text",
    value: "Shown.",
  })
})
