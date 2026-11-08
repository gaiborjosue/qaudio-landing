import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import ts from "typescript"
import {
  loaderNeedsMinimum,
  LOADER_COOLDOWN_MS,
  LOADER_SHOWN_KEY,
} from "../lib/loader-timing.ts"

const stubs = {
  react: `
    export const useState = value => globalThis.__loaderHarness.state(value)
    export const useRef = value => globalThis.__loaderHarness.ref(value)
    export const useEffect = (setup, deps) => globalThis.__loaderHarness.effect(setup, deps)
  `,
  "react/jsx-runtime": `
    export const jsx = (type, props) => ({ type, props })
    export const jsxs = jsx
    export const Fragment = "fragment"
  `,
  "@/components/liquid-glass-logo": 'export const LiquidGlassLogo = "logo"',
  "@/components/liquid-glass-logo-renderer":
    "export const liquidGlassLogoFinishTime = 3",
}
registerHooks({
  resolve(specifier, context, next) {
    if (stubs[specifier])
      return {
        url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
        shortCircuit: true,
      }
    if (specifier === "@/lib/loader-timing")
      return {
        url: new URL("../lib/loader-timing.ts", import.meta.url).href,
        shortCircuit: true,
      }
    return next(specifier, context)
  },
  load(url, context, next) {
    if (url.endsWith("/components/site-loader.tsx"))
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
    return next(url, context)
  },
})
const { SiteLoader } = await import("../components/site-loader.tsx")

function storage(value) {
  const items = new Map(value === undefined ? [] : [[LOADER_SHOWN_KEY, value]])
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
  }
}

// Run the component's hooks and effects without a browser or WebGL renderer.
function mount(t, saved, { loaded = true, fonts = Promise.resolve() } = {}) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 100_000 })
  const originals = new Map()
  const listeners = new Set()
  const frames = new Map()
  let frameId = 0
  const h = {
    slots: [],
    effects: new Map(),
    pending: [],
    cursor: 0,
    state(initial) {
      const index = this.cursor++
      if (!(index in this.slots)) this.slots[index] = initial
      return [
        this.slots[index],
        (value) => {
          this.slots[index] = value
        },
      ]
    },
    ref(initial) {
      const index = this.cursor++
      if (!(index in this.slots)) this.slots[index] = { current: initial }
      return this.slots[index]
    },
    effect(setup, deps) {
      const index = this.cursor++
      const previous = this.effects.get(index)
      if (!previous || deps.some((dep, i) => dep !== previous.deps[i]))
        this.pending.push({ index, setup, deps })
    },
    render() {
      this.cursor = 0
      globalThis.__loaderHarness = this
      return SiteLoader()
    },
    commit() {
      for (const entry of this.pending.splice(0)) {
        this.effects.get(entry.index)?.cleanup?.()
        this.effects.set(entry.index, { ...entry, cleanup: entry.setup() })
      }
    },
    replay() {
      for (const entry of this.effects.values()) {
        entry.cleanup?.()
        entry.cleanup = entry.setup()
      }
    },
    unmount() {
      for (const entry of this.effects.values()) entry.cleanup?.()
    },
    async flush() {
      await new Promise((resolve) => setImmediate(resolve))
      this.render()
      this.commit()
    },
    load() {
      document.readyState = "complete"
      for (const listener of [...listeners]) listener()
    },
    frame() {
      for (const [id, callback] of [...frames]) {
        frames.delete(id)
        callback()
      }
    },
    get phase() {
      return this.slots[0]
    },
    listeners,
    frames,
  }
  const globals = {
    window: {
      sessionStorage: saved,
      setTimeout: (...args) => setTimeout(...args),
      clearTimeout: (id) => clearTimeout(id),
      addEventListener: (name, callback) => {
        if (name === "load") listeners.add(callback)
      },
      removeEventListener: (name, callback) => {
        if (name === "load") listeners.delete(callback)
      },
    },
    document: {
      readyState: loaded ? "complete" : "loading",
      fonts: { ready: fonts },
    },
    requestAnimationFrame: (callback) => {
      frames.set(++frameId, callback)
      return frameId
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  }
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    })
  }
  t.after(() => {
    h.unmount()
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
    delete globalThis.__loaderHarness
  })
  h.render()
  h.commit()
  return h
}

test("minimum display resumes at exactly 60 seconds, not before", () => {
  assert.equal(LOADER_COOLDOWN_MS, 60_000)
  assert(loaderNeedsMinimum(null, 100_000))
  assert(!loaderNeedsMinimum(100_000, 100_000))
  assert(!loaderNeedsMinimum(100_000, 159_999))
  assert(loaderNeedsMinimum(100_000, 160_000))
  for (const invalid of [NaN, Infinity, -1, 100_001])
    assert(loaderNeedsMinimum(invalid, 100_000))
})

test("first display keeps the logo landing, 450ms hold, and 600ms fade", async (t) => {
  const saved = storage()
  const h = mount(t, saved)
  await h.flush()
  assert.equal(h.phase, "finishing")
  h.slots[1].current = { time: () => 0 }
  h.frame()
  assert.equal(h.phase, "finishing")
  assert.equal(h.frames.size, 1)
  h.slots[1].current = { time: () => 3 }
  h.frame()
  t.mock.timers.tick(449)
  assert.equal(h.phase, "finishing")
  t.mock.timers.tick(1)
  await h.flush()
  assert.equal(h.phase, "leaving")
  t.mock.timers.tick(599)
  assert.equal(h.phase, "leaving")
  t.mock.timers.tick(1)
  await h.flush()
  assert.equal(h.phase, "done")
  assert.equal(saved.getItem(LOADER_SHOWN_KEY), "100000")
})

test("recent display waits for both page and fonts, then exits with no frame or timer wait", async (t) => {
  let finishFonts
  const fonts = new Promise((resolve) => {
    finishFonts = resolve
  })
  const h = mount(t, storage("99999"), { loaded: false, fonts })
  await h.flush()
  assert.equal(h.phase, "loading")
  h.load()
  await h.flush()
  assert.equal(h.phase, "loading")
  finishFonts()
  await h.flush()
  assert.equal(h.phase, "done")
  assert.equal(h.frames.size, 0)
  t.mock.timers.tick(10_000)
  assert.equal(h.phase, "done")
})

test("ready fonts alone cannot release a repeat loader before the page is ready", async (t) => {
  const h = mount(t, storage("99999"), { loaded: false })
  await h.flush()
  assert.equal(h.phase, "loading")
  h.load()
  await h.flush()
  assert.equal(h.phase, "done")
})

test("each appearance refreshes the per-tab cooldown, including a separate document mount", async (t) => {
  const saved = storage("40001")
  const h = mount(t, saved)
  await h.flush()
  assert.equal(h.phase, "done")
  assert.equal(saved.getItem(LOADER_SHOWN_KEY), "100000")
  t.mock.timers.tick(1000)
  h.unmount()
  h.slots = []
  h.effects.clear()
  h.render()
  h.commit()
  await h.flush()
  assert.equal(h.phase, "done")
  assert.equal(saved.getItem(LOADER_SHOWN_KEY), "101000")
})

test("after cooldown the full entrance returns", async (t) => {
  const h = mount(t, storage("40000"))
  await h.flush()
  assert.equal(h.phase, "finishing")
})

test("Strict Mode replay does not mistake this mount for a repeat display", async (t) => {
  const h = mount(t, storage(), { loaded: false })
  h.replay()
  assert.equal(h.listeners.size, 1)
  h.load()
  await h.flush()
  assert.equal(h.phase, "finishing")
})

test("unmount removes the load listener and ignores pending readiness", async (t) => {
  let finishFonts
  const h = mount(t, storage(), {
    loaded: false,
    fonts: new Promise((resolve) => {
      finishFonts = resolve
    }),
  })
  h.unmount()
  assert.equal(h.listeners.size, 0)
  h.load()
  finishFonts()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(h.phase, "loading")
  assert.equal(h.frames.size, 0)
})

test("unavailable storage reports the failure and preserves the full first-load behavior", async (t) => {
  const warn = t.mock.method(console, "warn", () => {})
  const h = mount(t, {
    getItem() {
      throw new DOMException("Unavailable", "SecurityError")
    },
    setItem() {
      throw new Error("Should not write")
    },
  })
  await h.flush()
  assert.equal(h.phase, "finishing")
  assert.equal(warn.mock.callCount(), 1)
  assert.equal(
    warn.mock.calls[0].arguments[0],
    "Couldn’t remember the site loader display time."
  )
})
