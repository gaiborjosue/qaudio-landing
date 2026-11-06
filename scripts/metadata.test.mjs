import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import sharp from "sharp"

const stubs = {
  "@/lib/admin/auth":
    "export const getAdmin = () => globalThis.__metadataAuth()",
  "@/lib/supabase/server":
    "export const sessionSupabase = () => globalThis.__metadataDb",
  "next/cache":
    "export const updateTag = tag => globalThis.__metadataTags.push(tag)",
  "@/lib/catalog-data": "export const CATALOG_CACHE_TAG = 'catalog'",
}
registerHooks({
  resolve(specifier, context, next) {
    if (stubs[specifier])
      return {
        url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`,
        shortCircuit: true,
      }
    if (specifier.startsWith("@/"))
      specifier = new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href
    if (
      specifier.startsWith(".") &&
      context.parentURL?.endsWith(".ts") &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      const candidate = fileURLToPath(
        new URL(`${specifier}.ts`, context.parentURL)
      )
      if (existsSync(candidate))
        return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})

const { metadataInput, metadataOrder, metadataError, METADATA_IMAGE_MAX } =
  await import("../lib/admin/metadata.ts")
const { encodeMetadataImage, metadataImageRoute } =
  await import("../lib/admin/metadata-image.ts")
const { saveMetadata } = await import("../lib/admin/metadata-save.ts")
const actions = await import("../app/admin/metadata/actions.ts")
const { catalogAssetUrl, categoryAssets, productTaxonomyAssets } =
  await import("../lib/catalog-assets.ts")
const { prepareMetadataImage, logoTone } =
  await import("../lib/admin/metadata-upload.ts")
const uuid = "00000000-0000-4000-8000-000000000001"
const staged = `uploads/${uuid}.webp`
const category = {
  kind: "categories",
  slug: "test-category",
  name: "Test category",
  wheel_label: "Test",
  artwork_path: "/categories/test.png",
  scene_path: "/category-scenes/test.jpg",
}
const brand = {
  kind: "brands",
  slug: "test-brand",
  name: "Test brand",
  logo_path: staged,
}

test("metadata validates legacy and uploaded images, fixed slugs, labels, and path boundaries", () => {
  assert(metadataInput.safeParse(category).success)
  assert(metadataInput.safeParse(brand).success)
  assert(
    metadataInput.safeParse({ ...brand, logo_path: `brands/${uuid}.webp` })
      .success
  )
  for (const path of [
    "https://evil.example/logo.png",
    "//evil.example/logo.png",
    "/brands/../secret",
    "products/logo.webp",
    "uploads/../logo.webp",
  ]) {
    assert(
      !metadataInput.safeParse({ ...brand, logo_path: path }).success,
      path
    )
  }
  assert(
    !metadataInput.safeParse({ ...brand, original_slug: "old-brand" }).success
  )
  assert(
    !metadataInput.safeParse({ ...category, wheel_label: "x".repeat(41) })
      .success
  )
  assert(!metadataInput.safeParse({ ...brand, name: "  " }).success)
})

test("orders require an exact permutation", () => {
  assert(
    metadataOrder.safeParse({
      kind: "brands",
      expected: ["a", "b"],
      ordered: ["b", "a"],
    }).success
  )
  for (const ordered of [["a"], ["a", "a"], ["a", "c"]])
    assert(
      !metadataOrder.safeParse({
        kind: "brands",
        expected: ["a", "b"],
        ordered,
      }).success
    )
})

test("asset resolution handles both taxonomy and embedded product joins", () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://metadata-test.supabase.co"
  assert.equal(catalogAssetUrl("/brands/logo.png"), "/brands/logo.png")
  const url = catalogAssetUrl(`brands/${uuid}.webp`)
  assert(
    url.startsWith(
      "https://metadata-test.supabase.co/storage/v1/object/public/media/brands/"
    )
  )
  assert.equal(catalogAssetUrl(url), url)
  const product = productTaxonomyAssets({
    category: { artwork_path: `categories/${uuid}.webp` },
    brand: { logo_path: `brands/${uuid}.webp` },
  })
  assert(product.category.artwork_path.startsWith("https://"))
  assert.equal(product.brand.logo_path, url)
  assert(
    categoryAssets({
      artwork_path: "/categories/a.png",
      scene_path: `category-scenes/${uuid}.webp`,
    }).scene_path.startsWith("https://")
  )
})

test("every metadata action refuses unsigned users before touching data", async () => {
  globalThis.__metadataAuth = async () => null
  globalThis.__metadataDb = undefined
  for (const action of [
    actions.saveMetadataFromEditor,
    actions.deleteMetadataFromAdmin,
    actions.saveMetadataOrder,
  ]) {
    assert.deepEqual(await action({}), { error: "Sign in as an admin." })
  }
})

test("actions reject malformed input and protect Used Equipment without a write", async () => {
  globalThis.__metadataAuth = async () => ({ id: uuid })
  assert(
    "error" in
      (await actions.saveMetadataFromEditor({
        ...brand,
        original_slug: "other",
      }))
  )
  assert(
    "error" in
      (await actions.saveMetadataOrder({
        kind: "brands",
        expected: ["a", "b"],
        ordered: ["b"],
      }))
  )
  assert.match(
    (
      await actions.deleteMetadataFromAdmin({
        kind: "categories",
        slug: "used-equipment",
      })
    ).error,
    /navigation/
  )
})

function fakeDb({ error, missing = false, count = 0 } = {}) {
  const calls = []
  const db = {
    calls,
    storage: {
      from: () => ({
        copy: async (source, target) => {
          calls.push(["copy", source, target])
          return { error: null }
        },
      }),
    },
    from(table) {
      let head = false
      const query = {
        insert(row) {
          calls.push(["insert", table, row])
          return query
        },
        update(row) {
          calls.push(["update", table, row])
          return query
        },
        delete() {
          calls.push(["delete", table])
          return query
        },
        eq(key, value) {
          calls.push(["eq", key, value])
          return query
        },
        select(columns, options) {
          head = !!options?.head
          return query
        },
        order() {
          return query
        },
        limit: async () => ({ data: [{ sort_order: 12 }], error: null }),
        then(resolve) {
          resolve(
            head
              ? { count, error: null }
              : { data: missing ? [] : [{ slug: brand.slug }], error }
          )
        },
      }
      return query
    },
    rpc: async (name, input) => {
      calls.push(["rpc", name, input])
      return { error: name === "prepare_media_copy" ? null : error }
    },
  }
  return db
}

test("saves place staged artwork first and append new entries", async () => {
  const db = fakeDb()
  await saveMetadata(db, brand)
  assert.equal(db.calls[0][1], "prepare_media_copy")
  assert.deepEqual(db.calls[1], ["copy", staged, `brands/${uuid}.webp`])
  const row = db.calls.find((call) => call[0] === "insert")[2]
  assert.equal(row.logo_path, `brands/${uuid}.webp`)
  assert.equal(row.sort_order, 13)
})

test("editing preserves order and targets the immutable slug", async () => {
  const db = fakeDb()
  await saveMetadata(db, { ...category, original_slug: category.slug })
  assert.equal(db.calls[0][0], "update")
  assert(!("sort_order" in db.calls[0][2]))
  assert(db.calls.some((call) => call[0] === "eq" && call[2] === category.slug))
  await assert.rejects(
    saveMetadata(fakeDb({ missing: true }), {
      ...category,
      original_slug: category.slug,
    }),
    /no longer exists/
  )
})

test("mutations refresh the catalog and deletion counts include drafts", async () => {
  globalThis.__metadataTags = []
  globalThis.__metadataDb = fakeDb({ count: 1 })
  assert.match(
    (
      await actions.deleteMetadataFromAdmin({
        kind: "brands",
        slug: brand.slug,
      })
    ).error,
    /Products still use/
  )
  assert(!globalThis.__metadataDb.calls.some((call) => call[0] === "delete"))
  globalThis.__metadataDb = fakeDb()
  assert("slug" in (await actions.saveMetadataFromEditor(brand)))
  assert.deepEqual(globalThis.__metadataTags, ["catalog"])
  assert.deepEqual(
    await actions.deleteMetadataFromAdmin({ kind: "brands", slug: brand.slug }),
    { deleted: true }
  )
  assert.deepEqual(
    await actions.saveMetadataOrder({
      kind: "brands",
      expected: ["a", "b"],
      ordered: ["b", "a"],
    }),
    { saved: true }
  )
  assert.equal(globalThis.__metadataTags.length, 3)
})

test("database and provider errors return safe messages", async () => {
  assert(
    !metadataError({ message: "private provider payload" }).includes("payload")
  )
  globalThis.__metadataDb = fakeDb({
    error: { code: "23505", message: "raw SQL" },
  })
  assert.match(
    (await actions.saveMetadataFromEditor(brand)).error,
    /already in use/
  )
  globalThis.__metadataDb = {
    from() {
      throw new Error("private provider payload")
    },
  }
  assert(
    !JSON.stringify(await actions.saveMetadataFromEditor(category)).includes(
      "payload"
    )
  )
})

const png = async () =>
  sharp({
    create: {
      width: 16,
      height: 12,
      channels: 4,
      background: { r: 20, g: 50, b: 90, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer()
test("icons preserve transparency and logo inversion retains a black backdrop", async () => {
  const icon = await encodeMetadataImage(await png(), "icon", false)
  assert.equal((await sharp(icon).metadata()).hasAlpha, true)
  const pixels = await sharp(icon).raw().toBuffer()
  assert.equal(pixels[0], pixels[1])
  const black = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#000" },
  })
    .png()
    .toBuffer()
  const logo = await encodeMetadataImage(black, "logo", true)
  assert((await sharp(logo).raw().toBuffer())[0] > 240)
  await assert.rejects(
    encodeMetadataImage(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'
      ),
      "logo",
      false
    )
  )
})

const origin = "https://qaudio.example"
const post = (body, options = {}) =>
  new Request(`${origin}/api/admin/metadata/image?kind=icon`, {
    method: "POST",
    headers: { origin, "content-type": "image/png", ...options.headers },
    body,
    ...(options.signal && { signal: options.signal }),
  })
const imageDeps = (overrides = {}) => ({
  authorize: async () => true,
  store: async () => staged,
  remove: async () => {},
  ...overrides,
})

test("image requests need an admin, same origin, supported type, and bounded size", async () => {
  assert.equal(
    (
      await metadataImageRoute(
        post("x"),
        imageDeps({ authorize: async () => false })
      )
    ).status,
    401
  )
  assert.equal(
    (
      await metadataImageRoute(
        post("x", { headers: { origin: "https://evil.example" } }),
        imageDeps()
      )
    ).status,
    403
  )
  assert.equal(
    (
      await metadataImageRoute(
        post("x", { headers: { "content-type": "image/svg+xml" } }),
        imageDeps()
      )
    ).status,
    400
  )
  assert.equal(
    (
      await metadataImageRoute(
        post("x", {
          headers: { "content-length": String(METADATA_IMAGE_MAX + 1) },
        }),
        imageDeps()
      )
    ).status,
    413
  )
  assert.equal(
    (
      await metadataImageRoute(
        post(Buffer.alloc(METADATA_IMAGE_MAX + 1)),
        imageDeps()
      )
    ).status,
    413
  )
})

test("images are normalized before upload and cancelled uploads are removed", async () => {
  let stored
  const response = await metadataImageRoute(
    post(await png()),
    imageDeps({
      store: async (bytes) => {
        stored = bytes
        return staged
      },
    })
  )
  assert.equal(response.status, 200)
  assert.equal(response.headers.get("cache-control"), "no-store")
  assert.equal((await sharp(stored).metadata()).format, "webp")
  const controller = new AbortController()
  const removed = []
  const cancelled = await metadataImageRoute(
    post(await png(), { signal: controller.signal }),
    imageDeps({
      store: async () => {
        controller.abort()
        return staged
      },
      remove: async (path) => removed.push(path),
    })
  )
  assert.equal(cancelled.status, 499)
  assert.deepEqual(removed, [staged])
})

test("browser preparation preserves artwork, resizes photos, and releases bitmaps", async () => {
  const originalDocument = globalThis.document
  const originalBitmap = globalThis.createImageBitmap
  let closed = 0
  let canvas
  let type
  globalThis.createImageBitmap = async () => ({
    width: 2400,
    height: 1200,
    close() {
      closed++
    },
  })
  globalThis.document = {
    createElement() {
      canvas = {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage() {} }),
        toBlob(callback, mime) {
          type = mime
          callback(new Blob(["image"], { type: mime }))
        },
      }
      return canvas
    },
  }
  try {
    const icon = await prepareMetadataImage(
      { type: "image/png", size: 10 },
      "icon"
    )
    assert.deepEqual(
      [canvas.width, canvas.height, type, icon.tone],
      [1024, 512, "image/png", null]
    )
    await prepareMetadataImage({ type: "image/jpeg", size: 10 }, "scene")
    assert.deepEqual(
      [canvas.width, canvas.height, type],
      [1600, 800, "image/webp"]
    )
    assert.equal(closed, 2)
    await assert.rejects(
      prepareMetadataImage({ type: "image/svg+xml", size: 10 }, "icon"),
      /PNG/
    )
  } finally {
    globalThis.document = originalDocument
    globalThis.createImageBitmap = originalBitmap
  }
})

/** RGBA pixels: `ground` everywhere, `mark` in the middle (a third each way). */
function artwork(ground, mark, size = 30) {
  const pixels = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside =
        x >= size / 3 &&
        x < (2 * size) / 3 &&
        y >= size / 3 &&
        y < (2 * size) / 3
      pixels.set(inside ? mark : ground, (y * size + x) * 4)
    }
  }
  return [pixels, size, size]
}
const clear = [0, 0, 0, 0]
const black = [10, 10, 10, 255]
const white = [250, 250, 250, 255]

test("a logo's tone comes from its marks on a clear ground, or from a solid ground", () => {
  assert.equal(logoTone(...artwork(clear, black)), "dark")
  assert.equal(logoTone(...artwork(clear, white)), "light")
  assert.equal(logoTone(...artwork(white, black)), "dark")
  assert.equal(logoTone(...artwork(black, white)), "light")
  // Nothing drawn, or nothing at all: left as it is.
  assert.equal(logoTone(...artwork(clear, clear)), "light")
  assert.equal(logoTone(new Uint8ClampedArray(0), 0, 0), "light")
  // A colour reads by its lightness: a navy wordmark is dark artwork.
  assert.equal(logoTone(...artwork(clear, [20, 40, 110, 255])), "dark")
})

test("a logo is prepared with its tone, read from the drawn pixels", async () => {
  const originalDocument = globalThis.document
  const originalBitmap = globalThis.createImageBitmap
  globalThis.createImageBitmap = async () => ({
    width: 30,
    height: 30,
    close() {},
  })
  const [data] = artwork(clear, black)
  globalThis.document = {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage() {}, getImageData: () => ({ data }) }),
      toBlob: (callback, mime) => callback(new Blob(["image"], { type: mime })),
    }),
  }
  try {
    const logo = await prepareMetadataImage(
      { type: "image/png", size: 10 },
      "logo"
    )
    assert.equal(logo.tone, "dark")
    assert.equal(logo.blob.type, "image/png")
  } finally {
    globalThis.document = originalDocument
    globalThis.createImageBitmap = originalBitmap
  }
})
