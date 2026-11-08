import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import { existsSync } from "node:fs"
import test from "node:test"
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server.js"
import { hasLocalMatch } from "next/dist/shared/lib/match-local-pattern.js"

// Read the real config without starting Eve's hosting integration.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "eve/next")
      return {
        url: "data:text/javascript,export const withEve = config => config",
        shortCircuit: true,
      }
    if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
      const url = new URL(`${specifier}.ts`, context.parentURL)
      if (existsSync(url)) return { url: url.href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://catalog-test.supabase.co"
const { default: nextConfig } = await import("../next.config.ts")
const request = (path) =>
  unstable_getResponseFromNextConfig({
    url: `https://qaudio.test${path}`,
    nextConfig,
  })

test("Next Image allows the catalog cache version and rejects unrelated queries", () => {
  for (const path of [
    "/brands/kef.png?catalog=2",
    "/categories/speakers.png?catalog=2",
    "/qaudio-logo.svg",
  ])
    assert(hasLocalMatch(nextConfig.images.localPatterns, path), path)
  for (const path of ["/brands/kef.png?unexpected=1", "/other.png?catalog=2"])
    assert(!hasLocalMatch(nextConfig.images.localPatterns, path), path)
})

test("legacy category and brand pages still redirect to the shop", async () => {
  for (const [path, target] of [
    ["/categories/speakers", "/shop/speakers"],
    ["/categories/preamplifier-processor", "/shop/preamplifiers"],
    ["/categories/subwoofer", "/shop/subwoofers"],
    ["/brands/musical-fideliy", "/shop?brand=musical-fidelity"],
    ["/brands/u-turn-audio", "/shop?brand=u-turn-audio"],
    ["/used", "/shop/used-equipment"],
  ]) {
    const response = await request(path)
    assert.equal(response.status, 308, path)
    assert.equal(
      response.headers.get("location"),
      `https://qaudio.test${target}`
    )
  }
})

test("bundled artwork filenames bypass page redirects, with or without cache versions", async () => {
  for (const path of [
    "/brands/bluesound.png",
    "/brands/u-turn-audio.jpg",
    "/brands/klh.svg",
    "/categories/preamplifiers.svg",
    "/categories/subwoofers.svg",
    "/categories/turntables.png",
  ]) {
    for (const url of [path, `${path}?catalog=2`]) {
      const response = await request(url)
      assert.equal(response.status, 200, url)
      assert.equal(response.headers.get("location"), null, url)
    }
  }
})
