import assert from "node:assert/strict"
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
  access,
} from "node:fs/promises"
import { registerHooks } from "node:module"
import { tmpdir } from "node:os"
import { basename, dirname, join, resolve } from "node:path"
import test from "node:test"
import { setTimeout as delay } from "node:timers/promises"

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === "server-only")
      return { url: "data:text/javascript,export {}", shortCircuit: true }
    return next(specifier, context)
  },
})
const { pruneLocalChatHistory, LOCAL_CHAT_BUFFER } =
  await import("../lib/admin/local-chat-history.ts")
const env = { NODE_ENV: "development" }
const runId = (n) => `wrun_${String(n).padStart(26, "0")}`
const traceId = (n) => n.toString(16).padStart(32, "0")
async function present(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function fixture(t) {
  const temporary = resolve(tmpdir())
  const root = await mkdtemp(join(temporary, "qaudio-chat-retention-"))
  t.after(async () => {
    assert.equal(dirname(resolve(root)), temporary)
    assert.match(basename(root), /^qaudio-chat-retention-/)
    await rm(root, { recursive: true, force: true })
  })
  const workflow = join(root, ".eve/.workflow-data")
  const traces = join(root, ".eve/traces/v1")
  for (const folder of [
    "runs",
    "events",
    "steps",
    "streams/runs",
    "streams/chunks",
    "hooks/by-run",
    "waits",
  ])
    await mkdir(join(workflow, folder), { recursive: true })
  await mkdir(traces, { recursive: true })
  await writeFile(
    join(workflow, "version.txt"),
    "@workflow/world-local@5.1.2\n"
  )
  async function write(relative, value) {
    const path = join(root, relative)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(
      path,
      typeof value === "string" ? value : JSON.stringify(value)
    )
  }
  async function putRun(id, value) {
    await write(`.eve/.workflow-data/runs/${id}.json`, { runId: id, ...value })
  }
  async function chat(
    n,
    { status = "completed", timerStatus = status, child = false } = {}
  ) {
    const id = runId(n * 10),
      timer = runId(n * 10 + 1)
    const attributes = {
      "$eve.type": "session",
      "$eve.trigger": "channel:eve",
      "$eve.trace_id": traceId(n),
    }
    const rootRun = {
      workflowName: "workflow//eve//workflowEntry",
      status,
      completedAt: new Date(Date.UTC(2030, 0, n)).toISOString(),
      attributes,
    }
    await putRun(id, rootRun)
    await putRun(timer, {
      workflowName: "workflow//eve//sessionTimeoutWorkflow",
      status: timerStatus,
      attributes: { $rootRunId: id, $parentRunId: id },
    })
    if (child)
      await putRun(runId(n * 10 + 2), {
        workflowName: "workflow//eve//workflowEntry",
        status,
        attributes: {
          ...attributes,
          "$eve.trigger": "task",
          $rootRunId: id,
          $parentRunId: id,
        },
      })
    const stream = `strm_${id.slice(5)}_user`
    for (const folder of ["events", "steps"])
      await write(`.eve/.workflow-data/${folder}/${id}/record.json`, {
        runId: id,
        text: "History fixture",
      })
    await write(`.eve/.workflow-data/streams/runs/${id}.json`, {
      streams: [stream],
    })
    await write(
      `.eve/.workflow-data/streams/chunks/${stream}/chunk.bin`,
      "Transcript fixture"
    )
    await write(`.eve/.workflow-data/hooks/hook-${n}.json`, {
      runId: id,
      token: "fixture",
    })
    await write(`.eve/.workflow-data/hooks/by-run/${id}-hook.json`, {
      hookId: `hook-${n}`,
    })
    await write(`.eve/.workflow-data/waits/${timer}-wait.json`, {
      runId: timer,
    })
    await write(`.eve/traces/v1/${traceId(n)}/segments/span.otlp.json`, {
      resourceSpans: [
        {
          scopeSpans: [
            {
              spans: [
                {
                  attributes: [
                    {
                      key: "gen_ai.conversation.id",
                      value: { stringValue: id },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    })
    return { id, timer, rootRun, stream }
  }
  const prune = (options = {}) =>
    pruneLocalChatHistory({ appRoot: root, env, ...options })
  return { root, workflow, traces, write, putRun, chat, prune }
}

test("keeps the newest three ended conversations, their child runs, and every unfinished chat", async (t) => {
  const f = await fixture(t)
  for (let n = 1; n <= 6; n++) await f.chat(n, { child: n === 1 })
  const current = await f.chat(7, { status: "running" })
  await f.write(".env", "unrelated")
  await f.write(".eve/compile/keep.json", "compiled artifacts")
  await f.putRun(runId(999), {
    workflowName: "unrelated-workflow",
    status: "completed",
  })
  const before = await readFile(join(f.workflow, "runs", `${current.id}.json`))
  const result = await f.prune({ currentSessionId: current.id })
  assert.equal(LOCAL_CHAT_BUFFER, 3)
  assert.deepEqual(result, {
    chatsRemoved: 3,
    runsRemoved: 7,
    tracesRemoved: 3,
  })
  for (let n = 1; n <= 7; n++) {
    const kept = n >= 4
    const id = runId(n * 10)
    for (const path of [
      join(f.workflow, "runs", `${id}.json`),
      join(f.workflow, "events", id),
      join(f.workflow, "steps", id),
      join(f.workflow, "streams/runs", `${id}.json`),
      join(f.workflow, "streams/chunks", `strm_${id.slice(5)}_user`),
      join(f.workflow, "hooks", `hook-${n}.json`),
      join(f.workflow, "hooks/by-run", `${id}-hook.json`),
      join(f.workflow, "waits", `${runId(n * 10 + 1)}-wait.json`),
      join(f.traces, traceId(n)),
    ])
      assert.equal(await present(path), kept, path)
  }
  assert.deepEqual(
    await readFile(join(f.workflow, "runs", `${current.id}.json`)),
    before
  )
  assert.equal(
    await present(join(f.workflow, "runs", `${runId(999)}.json`)),
    true
  )
  assert.equal(await readFile(join(f.root, ".env"), "utf8"), "unrelated")
  assert.equal(
    await readFile(join(f.root, ".eve/compile/keep.json"), "utf8"),
    "compiled artifacts"
  )
  assert.deepEqual(await f.prune(), {
    chatsRemoved: 0,
    runsRemoved: 0,
    tracesRemoved: 0,
  })
})

test("an unfinished child protects its completed parent, and shared traces remain readable", async (t) => {
  const f = await fixture(t)
  const pending = await f.chat(1, { timerStatus: "running" })
  for (let n = 2; n <= 5; n++) await f.chat(n)
  const shared = traceId(100)
  await f.write(`.eve/traces/v1/${shared}/segments/span.otlp.json`, {
    resourceSpans: [
      {
        scopeSpans: [
          {
            spans: [
              {
                attributes: [
                  { key: "agent.run.id", value: { stringValue: pending.id } },
                  {
                    key: "gen_ai.conversation.id",
                    value: { stringValue: runId(20) },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  })
  assert.equal((await f.prune()).chatsRemoved, 1)
  assert.equal(
    await present(join(f.workflow, "runs", `${pending.id}.json`)),
    true
  )
  assert.equal(await present(join(f.workflow, "hooks", "hook-1.json")), true)
  assert.equal(await present(join(f.traces, shared)), true)
})

test("a confirmed ending waits for final workflow writes before rolling the buffer", async (t) => {
  const f = await fixture(t)
  for (let n = 1; n <= 3; n++) await f.chat(n)
  const ending = await f.chat(4, { status: "running" })
  const result = f.prune({ endedSessionId: ending.id })
  await delay(20)
  await f.putRun(ending.id, { ...ending.rootRun, status: "completed" })
  await f.putRun(ending.timer, {
    workflowName: "workflow//eve//sessionTimeoutWorkflow",
    status: "cancelled",
    attributes: { $rootRunId: ending.id, $parentRunId: ending.id },
  })
  assert.equal((await result).chatsRemoved, 1)
  assert.equal(
    await present(join(f.workflow, "runs", `${runId(10)}.json`)),
    false
  )
  assert.equal(
    await present(join(f.workflow, "runs", `${ending.id}.json`)),
    true
  )
})

test("overlapping cleanup requests serialize without removing retained history", async (t) => {
  const f = await fixture(t)
  for (let n = 1; n <= 6; n++) await f.chat(n)
  const results = await Promise.all([f.prune(), f.prune()])
  assert.equal(
    results.reduce((sum, value) => sum + value.chatsRemoved, 0),
    3
  )
  assert.equal((await readdir(join(f.workflow, "runs"))).length, 6)
  assert.equal(
    await present(join(f.root, ".eve/local-chat-retention.lock")),
    false
  )
})

test("production and hosted deployments never inspect or remove local files", async (t) => {
  const f = await fixture(t)
  for (const env of [
    { NODE_ENV: "production" },
    { NODE_ENV: "development", VERCEL: "1" },
    {},
  ])
    assert.deepEqual(
      await pruneLocalChatHistory({ appRoot: join(f.root, "missing"), env }),
      { chatsRemoved: 0, runsRemoved: 0, tracesRemoved: 0 }
    )
})

test("unknown layouts, invalid IDs and linked paths fail closed before deletion", async (t) => {
  const f = await fixture(t)
  for (let n = 1; n <= 4; n++) await f.chat(n)
  await assert.rejects(
    f.prune({ endedSessionId: "../../other" }),
    /Invalid local chat/
  )
  await f.write(
    ".eve/.workflow-data/version.txt",
    "@workflow/world-local@future"
  )
  await assert.rejects(f.prune(), /Review local chat cleanup/)
  await f.write(
    ".eve/.workflow-data/version.txt",
    "@workflow/world-local@5.1.2"
  )
  const outside = join(f.root, "unrelated")
  await mkdir(outside)
  await writeFile(join(outside, "keep.txt"), "untouched")
  const link = join(f.workflow, "events", runId(10), "linked")
  await symlink(outside, link, "junction")
  await assert.rejects(f.prune(), /linked paths/)
  assert.equal(await readFile(join(outside, "keep.txt"), "utf8"), "untouched")
  assert.equal(
    await present(join(f.workflow, "runs", `${runId(10)}.json`)),
    true
  )
  assert.equal((await readdir(join(f.workflow, "runs"))).length, 8)
})
