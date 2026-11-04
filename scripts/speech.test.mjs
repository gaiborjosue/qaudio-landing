import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

registerHooks({
  resolve(specifier, context, next) {
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

const { translateSpeech } = await import("../lib/admin/speech-api.ts")
const { VOICE_MAX_BYTES, VOICE_MAX_SECONDS } =
  await import("../lib/admin/speech.ts")
const { VoiceRecorder } = await import("../lib/admin/voice-recorder.ts")
const origin = "https://qaudio.example"
const endpoint = `${origin}/api/admin/speech`
const neverFetch = () => assert.fail("Rejected requests must not reach Groq")
const access = {
  authorize: async () => true,
  apiKey: "test-only-groq-key",
  fetcher: neverFetch,
}

function request({
  type = "audio/webm;codecs=opus",
  size = 16,
  site = origin,
} = {}) {
  const body = new FormData()
  body.set(
    "file",
    new File([new Uint8Array(size)], "private-filename.webm", { type })
  )
  body.set("model", "ignore-client-model")
  body.set("language", "pl")
  return new Request(endpoint, {
    method: "POST",
    headers: { Origin: site },
    body,
  })
}

test("the endpoint checks admin access before reading audio or contacting Groq", async () => {
  const req = request()
  const response = await translateSpeech(req, {
    ...access,
    authorize: async () => false,
  })
  assert.equal(response.status, 401)
  assert.equal(req.bodyUsed, false)
  assert.match(response.headers.get("cache-control"), /no-store/)
})

test("cross-site and missing-origin requests are refused before consuming the body", async () => {
  for (const site of ["https://other.example", "null", ""]) {
    const req = request({ site })
    const response = await translateSpeech(req, access)
    assert.equal(response.status, 403)
    assert.equal(req.bodyUsed, false)
  }
})

test("configuration, empty audio, unsupported formats, and malformed multipart have safe errors", async () => {
  assert.equal(
    (await translateSpeech(request(), { ...access, apiKey: undefined })).status,
    503
  )
  assert.equal(
    (await translateSpeech(request({ size: 0 }), access)).status,
    400
  )
  assert.equal(
    (await translateSpeech(request({ type: "image/png" }), access)).status,
    415
  )
  const malformed = new Request(endpoint, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "multipart/form-data; boundary=broken",
    },
    body: "broken",
  })
  assert.equal((await translateSpeech(malformed, access)).status, 400)
})

test("both file and streamed body limits are enforced without trusting Content-Length", async () => {
  assert.equal(
    (await translateSpeech(request({ size: VOICE_MAX_BYTES + 1 }), access))
      .status,
    413
  )
  let cancelled = false
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new Uint8Array(1024 * 1024))
    },
    cancel() {
      cancelled = true
    },
  })
  const req = new Request(endpoint, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "multipart/form-data; boundary=audio",
    },
    body,
    duplex: "half",
  })
  assert.equal((await translateSpeech(req, access)).status, 413)
  assert.equal(cancelled, true)
})

test("Whisper Large v3 translates to English with a fixed endpoint and allowlisted response", async () => {
  for (const [type, extension] of [
    ["audio/webm;codecs=opus", "webm"],
    ["audio/mp4", "m4a"],
    ["audio/ogg;codecs=opus", "ogg"],
  ]) {
    const response = await translateSpeech(request({ type }), {
      ...access,
      fetcher: async (url, init) => {
        assert.equal(url, "https://api.groq.com/openai/v1/audio/translations")
        assert.equal(init.method, "POST")
        assert.equal(init.headers.Authorization, `Bearer ${access.apiKey}`)
        assert.equal(init.cache, "no-store")
        assert.equal(init.redirect, "error")
        assert.ok(init.signal instanceof AbortSignal)
        const form = init.body
        assert.equal(form.get("model"), "whisper-large-v3")
        assert.equal(form.get("response_format"), "json")
        assert.equal(form.get("temperature"), "0")
        assert.equal(form.has("language"), false)
        assert.equal(form.get("file").name, `voice.${extension}`)
        assert.equal(form.get("file").size, 16)
        return Response.json({
          text: "  Change Friday’s opening hours.  ",
          secret: "must-not-leak",
        })
      },
    })
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      text: "Change Friday’s opening hours.",
    })
    assert.match(response.headers.get("cache-control"), /no-store/)
  }
})

test("provider failures, empty and malformed results, and exceptions never expose provider details", async () => {
  for (const [fetcher, status] of [
    [async () => Response.json({ error: access.apiKey }, { status: 401 }), 502],
    [async () => Response.json({ error: access.apiKey }, { status: 429 }), 429],
    [async () => Response.json({ text: " " }), 422],
    [async () => Response.json({ text: { key: access.apiKey } }), 502],
    [async () => new Response("invalid json"), 504],
    [
      async () => {
        throw new Error(access.apiKey)
      },
      504,
    ],
  ]) {
    const response = await translateSpeech(request(), { ...access, fetcher })
    assert.equal(response.status, status)
    assert.equal((await response.text()).includes(access.apiKey), false)
  }
})

test("cancelling the incoming request also cancels the provider request", async () => {
  const abort = new AbortController()
  const req = new Request(request(), { signal: abort.signal })
  const response = await translateSpeech(req, {
    ...access,
    fetcher: async (_url, init) => {
      abort.abort()
      assert.equal(init.signal.aborted, true)
      throw init.signal.reason
    },
  })
  assert.equal(response.status, 504)
})

// Exercise the browser-independent recorder with the same event order as the
// native API: final dataavailable precedes stop, and permissions resolve later.
function browser(
  t,
  { permission, mimeType = "audio/webm;codecs=opus", fetcher = neverFetch } = {}
) {
  const track = { stop: t.mock.fn() }
  const stream = { getTracks: () => [track] }
  const instances = []
  class Recorder {
    static isTypeSupported(type) {
      return type === mimeType
    }
    constructor(_stream, options) {
      this.mimeType = options.mimeType || mimeType
      this.state = "inactive"
      instances.push(this)
    }
    start() {
      this.state = "recording"
    }
    stop() {
      this.state = "inactive"
      const ondata = this.ondataavailable
      const onstop = this.onstop
      queueMicrotask(() => {
        ondata?.({ data: new Blob(["spoken audio"], { type: this.mimeType }) })
        onstop?.()
      })
    }
  }
  const saved = new Map()
  for (const [key, value] of Object.entries({
    isSecureContext: true,
    navigator: {
      mediaDevices: { getUserMedia: permission || (async () => stream) },
    },
    MediaRecorder: Recorder,
    fetch: fetcher,
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    })
  }
  t.after(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else delete globalThis[key]
    }
  })
  const voice = new VoiceRecorder()
  t.after(() => voice.cancel())
  return { voice, stream, track, instances }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function settled(voice) {
  if (voice.getSnapshot().phase === "idle") return Promise.resolve()
  return new Promise((resolve) => {
    const unsubscribe = voice.subscribe(() => {
      if (voice.getSnapshot().phase === "idle") {
        unsubscribe()
        resolve()
      }
    })
  })
}

test("recording uses the chosen browser codec and only supplies editable text after Stop", async (t) => {
  for (const mimeType of ["audio/webm;codecs=opus", "audio/mp4"]) {
    await t.test(mimeType, async (sub) => {
      let calls = 0
      const pending = deferred()
      const { voice, track } = browser(sub, {
        mimeType,
        fetcher: async (url, init) => {
          calls++
          assert.equal(url, "/api/admin/speech")
          assert.equal(init.credentials, "same-origin")
          assert.equal(init.body.get("file").type, mimeType)
          return pending.promise
        },
      })
      const transcripts = []
      const start = voice.start((text) => transcripts.push(text))
      assert.equal(voice.getSnapshot().phase, "requesting")
      await start
      assert.equal(voice.getSnapshot().phase, "recording")
      assert.deepEqual(transcripts, [])
      assert.equal(calls, 0)
      voice.stop()
      assert.equal(voice.getSnapshot().phase, "transcribing")
      assert.ok(track.stop.mock.callCount() > 0)
      await Promise.resolve()
      assert.equal(calls, 1)
      assert.deepEqual(transcripts, [])
      pending.resolve(Response.json({ text: " Change the hours. " }))
      await settled(voice)
      assert.deepEqual(transcripts, ["Change the hours."])
    })
  }
})

test("a dismissed or hidden chat releases a late permission grant without recording", async (t) => {
  const permission = deferred()
  const { voice, stream, track, instances } = browser(t, {
    permission: () => permission.promise,
  })
  const result = t.mock.fn()
  const started = voice.start(result)
  voice.cancel()
  permission.resolve(stream)
  await started
  assert.equal(voice.getSnapshot().phase, "idle")
  assert.equal(track.stop.mock.callCount(), 1)
  assert.equal(instances.length, 0)
  assert.equal(result.mock.callCount(), 0)
})

test("denied permissions leave the draft alone and explain how to retry", async (t) => {
  const { voice } = browser(t, {
    permission: async () => {
      throw new DOMException("private detail", "NotAllowedError")
    },
  })
  const result = t.mock.fn()
  await voice.start(result)
  assert.equal(voice.getSnapshot().phase, "idle")
  assert.match(voice.getSnapshot().error, /site settings/)
  assert.equal(result.mock.callCount(), 0)
})

test("cancelling a recording discards queued final data and never uploads it", async (t) => {
  const { voice, track } = browser(t)
  const result = t.mock.fn()
  await voice.start(result)
  voice.cancel()
  await Promise.resolve()
  assert.equal(voice.getSnapshot().phase, "idle")
  assert.ok(track.stop.mock.callCount() > 0)
  assert.equal(result.mock.callCount(), 0)
})

test("cancelling transcription aborts the request and ignores even a late successful response", async (t) => {
  const pending = deferred()
  let signal
  const { voice } = browser(t, {
    fetcher: async (_url, init) => {
      signal = init.signal
      return pending.promise
    },
  })
  const result = t.mock.fn()
  await voice.start(result)
  voice.stop()
  await Promise.resolve()
  voice.cancel()
  assert.equal(signal.aborted, true)
  pending.resolve(Response.json({ text: "Must not appear in another chat" }))
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(result.mock.callCount(), 0)
  assert.equal(voice.getSnapshot().phase, "idle")
})

test("the duration limit stops capture and starts transcription", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] })
  const pending = deferred()
  const { voice, track } = browser(t, { fetcher: async () => pending.promise })
  await voice.start(() => assert.fail("No completed transcription yet"))
  t.mock.timers.tick(VOICE_MAX_SECONDS * 1000)
  assert.equal(voice.getSnapshot().seconds, VOICE_MAX_SECONDS)
  assert.equal(voice.getSnapshot().phase, "transcribing")
  assert.ok(track.stop.mock.callCount() > 0)
  await Promise.resolve()
  voice.cancel()
  pending.resolve(Response.json({ text: "Ignored after cancel" }))
})

test("device failures and oversized chunks release capture without sending text", async (t) => {
  for (const failure of ["device", "size"]) {
    await t.test(failure, async (sub) => {
      const { voice, track, instances } = browser(sub)
      const result = sub.mock.fn()
      await voice.start(result)
      if (failure === "device") instances[0].onerror()
      else
        instances[0].ondataavailable({
          data: new Blob([new Uint8Array(VOICE_MAX_BYTES + 1)]),
        })
      assert.equal(voice.getSnapshot().phase, "idle")
      assert.ok(voice.getSnapshot().error)
      assert.ok(track.stop.mock.callCount() > 0)
      assert.equal(result.mock.callCount(), 0)
    })
  }
})

test("a failed translation leaves the callback untouched and supports a fresh recording", async (t) => {
  const { voice } = browser(t, {
    fetcher: async () =>
      Response.json({ error: "Please try again." }, { status: 502 }),
  })
  const result = t.mock.fn()
  await voice.start(result)
  voice.stop()
  await settled(voice)
  assert.equal(voice.getSnapshot().error, "Please try again.")
  assert.equal(result.mock.callCount(), 0)
  await voice.start(result)
  assert.equal(voice.getSnapshot().phase, "recording")
  assert.equal(voice.getSnapshot().error, null)
})
