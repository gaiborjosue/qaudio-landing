import assert from "node:assert/strict"
import test from "node:test"
import { Client, SessionNotActiveError } from "eve/client"
import { ChatSession } from "../lib/admin/chat-session.ts"

const deferred = () => Promise.withResolvers()
const ended = (sessionId = "original") => Promise.resolve({ sessionId })

test("New chat waits for creation and accepted answers, then retires the returned ID", async () => {
  const session = new ChatSession()
  const creation = deferred()
  const answer = deferred()
  const events = []
  const send = session.request(async () => {
    await creation.promise
    session.sessionId = "created-session"
    events.push("created")
  })
  const respond = session.request(() => answer.promise)
  const retirement = session.retire(
    async () => {
      events.push(["end", session.sessionId])
      return ended(session.sessionId)
    },
    (id) => events.push(["reset", id])
  )

  assert.equal(session.ending, true)
  await assert.rejects(session.request(() => assert.fail("input while ending")))
  assert.deepEqual(events, [])
  creation.resolve()
  await send
  assert.deepEqual(events, ["created"])
  answer.resolve()
  await respond
  await retirement
  assert.deepEqual(events, [
    "created",
    ["end", "created-session"],
    ["reset", "created-session"],
  ])
  assert.equal(session.ending, false)
})

test("failed or unconfirmed endings preserve the session and allow a retry", async () => {
  const session = new ChatSession("original")
  let resets = 0
  const reset = () => resets++
  for (const end of [
    async () => {
      throw new Error("lost request")
    },
    async () => ({ sessionId: "another-session" }),
    async () => {
      throw new SessionNotActiveError({ retryable: true })
    },
  ]) {
    await assert.rejects(session.retire(end, reset))
    assert.equal(session.sessionId, "original")
    assert.equal(resets, 0)
    assert.equal(session.ending, false)
  }
  await session.retire(() => ended(), reset)
  assert.equal(resets, 1)
})

test("a definite inactive session and an unused chat can reset safely", async () => {
  const session = new ChatSession("retired")
  let resets = 0
  await session.retire(
    async () => {
      throw new SessionNotActiveError()
    },
    () => resets++
  )
  await new ChatSession().retire(
    () => assert.fail("no session to end"),
    () => resets++
  )
  assert.equal(resets, 2)
})

test("a delayed photo send from the retired chat cannot create a new session", async () => {
  const session = new ChatSession("original")
  const previousVersion = session.version
  await session.retire(
    () => ended(),
    () => {
      session.sessionId = undefined
    }
  )
  await assert.rejects(
    session.request(() => assert.fail("stale upload sent"), previousVersion),
    { name: "AbortError" }
  )
  assert.equal(
    await session.request(async () => "new input", session.version),
    "new input"
  )
})

test("an end timeout preserves the ID even when its late receipt succeeds", async () => {
  const session = new ChatSession("original")
  const request = deferred()
  let resets = 0
  const keepAlive = setTimeout(() => {}, 100)
  try {
    await assert.rejects(
      session.retire(
        () => request.promise,
        () => resets++,
        5
      )
    )
  } finally {
    clearTimeout(keepAlive)
  }
  request.resolve(await ended())
  await Promise.resolve()
  assert.equal(session.sessionId, "original")
  assert.equal(resets, 0)
  await session.retire(
    () => ended(),
    () => resets++
  )
  assert.equal(resets, 1)
})

test("unmount aborts the retirement wait and never resets the chat", async () => {
  const session = new ChatSession("original")
  const posted = deferred()
  const response = deferred()
  let resets = 0
  const retirement = session.retire(
    () => {
      posted.resolve()
      return response.promise
    },
    () => resets++
  )
  await posted.promise
  session.disconnect()
  await assert.rejects(retirement)
  response.resolve(await ended())
  await Promise.resolve()
  assert.equal(resets, 0)
  assert.equal(session.sessionId, "original")
})

test("the real Eve client can confirm end even when its receipt stream has no end delivery", async (t) => {
  const requests = []
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push([options.method, new URL(url).pathname])
    if (options.method === "POST")
      return Response.json({
        ok: true,
        sessionId: "original",
        deliveryId: "end-original",
      })
    return new Response("", {
      headers: {
        "content-type": "application/x-ndjson",
        "x-eve-stream-version": "27",
        "x-eve-stream-tail-index": "-1",
      },
    })
  })
  const remote = new Client({ baseUrl: "https://eve.example" }).sessions.attach(
    "original"
  )
  const receipt = await remote.end()
  await assert.rejects(
    receipt.result(),
    /stream ended before the accepted delivery settled/
  )
  const before = requests.length
  let resets = 0
  await new ChatSession("original").retire(
    () => Promise.resolve(receipt),
    () => resets++
  )
  assert.equal(resets, 1)
  assert.equal(
    requests.length,
    before,
    "retirement must not read the broken receipt stream"
  )
})

test("concurrent New chat clicks end and reset once, and failed sends don't block retirement", async () => {
  const session = new ChatSession("original")
  const acceptance = deferred()
  const send = session.request(() => acceptance.promise)
  let ends = 0
  let resets = 0
  const end = () => {
    ends++
    return ended()
  }
  const reset = () => resets++
  const first = session.retire(end, reset)
  const second = session.retire(end, reset)
  acceptance.reject(new Error("send rejected"))
  await assert.rejects(send)
  await Promise.all([first, second])
  assert.equal(ends, 1)
  assert.equal(resets, 1)
})
