import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier === "../lib/supabase" &&
      context.parentURL?.endsWith("/agent/tools/view_photos.ts")
    ) {
      return {
        url: `data:text/javascript,export const callerSupabase=()=>globalThis.mediaLifecycleClient;`,
        shortCircuit: true,
      }
    }
    if (
      specifier.startsWith(".") &&
      context.parentURL?.endsWith(".ts") &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      const file = fileURLToPath(new URL(`${specifier}.ts`, context.parentURL))
      if (existsSync(file))
        return { url: pathToFileURL(file).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})
const { cleanupRequest } =
  await import("../supabase/functions/media-cleanup/cleanup.ts")
const lifecycle = await import("../lib/admin/media-lifecycle.ts")
const { mediaUrl } = await import("../lib/media.ts")
const { photoLines, photoLine } = await import("../lib/admin/photo-lines.ts")
const { placeUploads } = await import("../lib/admin/uploads.ts")
const { viewPhotosFor } = await import("../agent/tools/view_photos.ts")
const id = "00000000-0000-4000-8000-000000000001"
const path = `uploads/chat/${id}/${id}.webp`
const token = "a".repeat(64)
const request = (body = {}, auth = token) =>
  new Request("https://worker.example", {
    method: "POST",
    headers: { Authorization: `Bearer ${auth}` },
    body: JSON.stringify(body),
  })

function store(options = {}) {
  const calls = []
  return {
    calls,
    async claim(_token, dryRun) {
      calls.push(["claim", dryRun])
      if (options.denied) throw new Error("sensitive provider text")
      return [{ bucket_id: "chat-uploads", path }]
    },
    async remove(bucket, paths) {
      calls.push(["remove", bucket, paths])
      if (options.fail) throw new Error("sensitive provider text")
    },
    async complete(_token, asset, success) {
      calls.push(["complete", asset.path, success])
    },
  }
}
test("cleanup rejects anonymous and invalid credentials before deleting, and hides upstream errors", async () => {
  const s = store()
  assert.equal((await cleanupRequest(request({}, "bad"), s)).status, 401)
  assert.deepEqual(s.calls, [])
  const denied = store({ denied: true })
  const response = await cleanupRequest(request(), denied)
  assert.equal(response.status, 403)
  assert(!JSON.stringify(await response.json()).includes("sensitive"))
  assert(!denied.calls.some((c) => c[0] === "remove"))
})
test("a dry run is the default and never removes or completes an asset", async () => {
  const s = store()
  assert.deepEqual(await (await cleanupRequest(request(), s)).json(), {
    dryRun: true,
    eligible: 1,
    deleted: 0,
    failed: 0,
  })
  assert.deepEqual(s.calls, [["claim", true]])
})
test("cleanup deletes through Storage, then completes claims; failures remain retryable", async () => {
  for (const fail of [false, true]) {
    const s = store({ fail })
    const response = await cleanupRequest(request({ dryRun: false }), s)
    assert.equal(response.status, fail ? 503 : 200)
    assert.deepEqual(s.calls, [
      ["claim", false],
      ["remove", "chat-uploads", [path]],
      ["complete", path, !fail],
    ])
    const result = await response.json()
    assert.equal(result.deleted, fail ? 0 : 1)
    assert.equal(result.failed, fail ? 1 : 0)
  }
})
test("private paths survive chat lines and use authenticated browser previews", () => {
  assert.equal(lifecycle.isPrivateUpload(path), true)
  assert.equal(lifecycle.mediaBucket(path), "chat-uploads")
  assert.equal(lifecycle.mediaBucket("uploads/old.jpg"), "media")
  for (const bad of [
    path.replace("uploads/chat/", "../"),
    `${path}/../x`,
    path.replace("webp", "pdf"),
  ])
    assert.equal(lifecycle.isPrivateUpload(bad), false)
  assert.equal(
    mediaUrl(path),
    `/api/admin/media?path=${encodeURIComponent(path)}`
  )
  const photo = { path, width: 1600, height: 1200 }
  assert.deepEqual(photoLines(photoLine(photo)), [photo])
})
test("promoting a private source registers and pins the destination before a cross-bucket copy", async () => {
  const calls = []
  const client = {
    async rpc(name, args) {
      calls.push([name, args])
      return { error: null }
    },
    storage: {
      from(bucket) {
        return {
          async copy(source, destination, options) {
            calls.push(["copy", bucket, source, destination, options])
            return { error: null }
          },
        }
      },
    },
  }
  const place = await placeUploads(
    client,
    [path, path],
    "news",
    (_what, error) => new Error(error.message)
  )
  assert.equal(place(path), `news/${id}.webp`)
  assert.equal(calls[0][0], "prepare_media_copy")
  assert.deepEqual(calls[1], [
    "copy",
    "chat-uploads",
    path,
    `news/${id}.webp`,
    { destinationBucket: "media" },
  ])
  assert.equal(calls.length, 2)
})
test("discarding private staged media checks references before deletion", async () => {
  const calls = []
  const client = {
    async rpc(name) {
      calls.push(name)
      return { error: { message: "in use" } }
    },
    storage: {
      from() {
        return {
          async remove() {
            calls.push("remove")
            return {}
          },
        }
      },
    },
  }
  await assert.rejects(
    lifecycle.discardStagedMedia(client, path),
    /still in use/
  )
  assert.deepEqual(calls, ["discard_media_upload"])
})
test("private model projections refresh signed URLs on replay and never persist them in tool output", async (t) => {
  let signed = 0
  const client = {
    async rpc() {
      return { error: null }
    },
    storage: {
      from() {
        return {
          async createSignedUrl() {
            return {
              data: {
                signedUrl: `https://storage.example/image?token=${++signed}`,
              },
              error: null,
            }
          },
        }
      },
    },
  }
  const { readableMediaUrl } = lifecycle
  assert.notEqual(
    await readableMediaUrl(client, path),
    await readableMediaUrl(client, path)
  )
  // The private tool stores paths; signed provider URLs are projected with a
  // caller-bound definition each time Eve rebuilds its model history.
  globalThis.mediaLifecycleClient = client
  t.after(() => delete globalThis.mediaLifecycleClient)
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(null, { headers: { "content-type": "image/webp" } })
  )
  const definition = viewPhotosFor({
    session: { auth: { current: { principalType: "user", attributes: {} } } },
  })
  const output = await definition.execute({ paths: [path] }, {})
  assert.deepEqual(output.photos, [{ path, mediaType: "image/webp" }])
  const first = await definition.toModelOutput(output)
  const second = await definition.toModelOutput(output)
  assert.notEqual(first.value[1].data.url, second.value[1].data.url)
  assert.equal(first.value[1].type, "file")
  assert(!JSON.stringify(output).includes("token="))
})
