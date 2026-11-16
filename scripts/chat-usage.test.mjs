import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { emptySessionView, foldEvents } from "eve/events"
import { wrapLanguageModel } from "ai"

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

const { responseUsage, formatCost } =
  await import("../lib/admin/response-usage.ts")
const { openRouterUsage } = await import("../agent/lib/model-usage.ts")
const MAIN = "openai/gpt-6.1-terra"
const FAST = "meta/muse-ember"
const GPT = "openai/gpt-image-2.6-flare"
const FLUX = "black-forest-labs/flux-3-image-klein"

function viewOf(modelRuns, toolCalls = []) {
  const events = []
  const emit = (type, data, scope) =>
    events.push({
      type,
      data,
      scope,
      meta: {
        position: { line: events.length + 1, index: 0 },
        at: "2026-11-05T18:00:00Z",
        endOfLine: true,
      },
    })
  const usage = (cost) => ({
    inputTokens: 10,
    outputTokens: 2,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    ...(cost !== undefined && { costUsd: cost }),
  })
  for (const turnId of new Set(modelRuns.map((run) => run.turn)))
    emit("turn.started", {
      turnId,
      cause: { deliveryId: `d-${turnId}` },
      follows: null,
    })
  for (const [index, run] of modelRuns.entries()) {
    const runId = run.id ?? `r${index}`
    if (run.change)
      emit("context.started", {
        changeId: run.change,
        kind: "compaction",
        turnId: run.turn,
      })
    emit("model.requested", {
      runId,
      owner: run.change ? { changeId: run.change } : { turnId: run.turn },
    })
    emit("model.started", { runId, modelId: run.model ?? MAIN, attempt: 0 })
    if (run.partId)
      emit("content.completed", {
        partId: run.partId,
        runId,
        kind: "text",
        phase: "reply",
        value: "Answer",
      })
    emit("model.settled", { runId, outcome: "completed" })
    emit("usage.recorded", {
      owner: { runId },
      kind: "model",
      usage: usage(run.cost),
    })
  }
  for (const call of toolCalls) {
    const ownerRun = modelRuns.findIndex((run) => run.turn === call.turn)
    emit("call.requested", {
      callId: call.id,
      owner: { runId: modelRuns[ownerRun].id ?? `r${ownerRun}` },
      capability: {
        kind: call.name === "copywriter" ? "agent" : "tool",
        name: call.name,
      },
    })
    emit("call.started", { callId: call.id })
    emit("call.settled", {
      callId: call.id,
      outcome: "completed",
      output: call.output,
    })
    if (call.cost !== undefined)
      emit("usage.recorded", {
        owner: { callId: call.id },
        kind: "model",
        usage: usage(call.cost),
      })
  }
  return foldEvents(emptySessionView(), events)
}
const message = (id, turn, parts = [], role = "assistant") => ({
  id,
  role,
  metadata: { turnId: turn },
  parts,
})
const tool = (name, input = {}, state = "completed", callId = name) => ({
  type: "tool",
  name,
  input,
  state,
  callId,
})
const progress = (input) => tool("flow_progress", input)

test("a response includes all its model steps and delegated copywriting, excluding other turns", () => {
  const messages = [message("old", "old"), message("answer", "answer")]
  const view = viewOf(
    [
      { turn: "old", cost: 9 },
      { turn: "answer", cost: 0.01 },
      { turn: "answer", model: FAST, cost: 0.002 },
    ],
    [{ turn: "answer", id: "copy", name: "copywriter", cost: 0.003 }]
  )
  const result = responseUsage("answer", messages, view)
  assert.equal(result.scope, "response")
  assert.equal(result.partial, false)
  assert.equal(formatCost(result.totalUsd), "$0.0150")
  assert.deepEqual(result.models, [
    { model: MAIN, costUsd: 0.01, partial: false },
    { model: FAST, costUsd: 0.002, partial: false },
    { model: "Copywriter (model unavailable)", costUsd: 0.003, partial: false },
  ])
})

test("historical Haiku receipts keep their model when the configured copywriter changes", () => {
  const oldModel = "anthropic/claude-haiku-5.5"
  const view = viewOf(
    [{ turn: "old", model: oldModel, cost: 0.002 }],
    [{ turn: "old", id: "copy", name: "copywriter", cost: 0.003 }]
  )
  const result = responseUsage("old", [message("old", "old")], view)
  assert.equal(formatCost(result.totalUsd), "$0.0050")
  assert.deepEqual(result.models, [
    { model: oldModel, costUsd: 0.002, partial: false },
    { model: "Copywriter (model unavailable)", costUsd: 0.003, partial: false },
  ])
})

test("the final flow reply includes its earlier turns, revisions and image extension once, including after replay", () => {
  const messages = [
    message("unrelated", "old"),
    message("first", "t1", [
      progress({ flow: "product-sale" }),
      tool("design_story", {}, "completed", "design"),
    ]),
    message("feedback", "t2", [], "user"),
    message("edit", "t2", [tool("edit_story", {}, "completed", "edit")]),
    message("continuation", "t3", [], "user"),
    message("final", "t3", [
      tool("instagram__save_post"),
      progress({ flow: "product-sale", status: "done" }),
    ]),
  ]
  const modelRuns = [
    { turn: "old", cost: 9 },
    { turn: "t1", cost: 0.02 },
    { turn: "t2", cost: 0.03 },
    { turn: "t3", cost: 0.04 },
  ]
  const toolCalls = [
    {
      turn: "t1",
      id: "design",
      name: "design_story",
      output: {
        usage: [
          { model: GPT, costUsd: 0.1 },
          { model: FLUX, costUsd: 0.01 },
        ],
      },
    },
    {
      turn: "t2",
      id: "edit",
      name: "edit_story",
      output: { usage: [{ model: FLUX, costUsd: 0.02 }] },
    },
  ]
  const result = responseUsage("final", messages, viewOf(modelRuns, toolCalls))
  assert.equal(result.scope, "flow")
  assert.equal(formatCost(result.totalUsd), "$0.2200")
  assert.equal(result.partial, false)
  assert.deepEqual(
    result.models.map((entry) => [entry.model, formatCost(entry.costUsd)]),
    [
      [MAIN, "$0.0900"],
      [GPT, "$0.1000"],
      [FLUX, "$0.0300"],
    ]
  )
  assert.deepEqual(
    responseUsage(
      "final",
      JSON.parse(JSON.stringify(messages)),
      viewOf(modelRuns, toolCalls)
    ),
    result
  )
  // Older Info remains scoped to that reply, without later edit spend.
  assert.equal(
    formatCost(
      responseUsage("first", messages, viewOf(modelRuns, toolCalls)).totalUsd
    ),
    "$0.1300"
  )
})

test("a later request or a repeated flow never inherits a previous flow's cost", () => {
  const messages = [
    message("flow1", "t1", [
      progress({ flow: "news-instagram" }),
      tool("instagram__save_post"),
    ]),
    message("thanks", "t2", [], "user"),
    message("reply", "t2"),
    message("new", "t3", [], "user"),
    message("flow2", "t3", [
      progress({ flow: "news-instagram" }),
      tool("instagram__save_post"),
    ]),
  ]
  const view = viewOf([
    { turn: "t1", cost: 5 },
    { turn: "t2", cost: 0.001 },
    { turn: "t3", cost: 0.02 },
  ])
  assert.equal(responseUsage("reply", messages, view).scope, "response")
  assert.equal(responseUsage("reply", messages, view).totalUsd, 0.001)
  assert.equal(responseUsage("flow2", messages, view).totalUsd, 0.02)
})

test("missing and invalid costs stay unavailable or partial, while free calls remain zero", () => {
  const messages = [message("answer", "t1")]
  for (const cost of [undefined, NaN, Infinity, -0.2]) {
    const result = responseUsage(
      "answer",
      messages,
      viewOf([{ turn: "t1", cost }])
    )
    assert.equal(result.totalUsd, null)
    assert.equal(result.partial, true)
  }
  const partial = responseUsage(
    "answer",
    messages,
    viewOf([
      { turn: "t1", cost: 0.01 },
      { turn: "t1", cost: undefined },
    ])
  )
  assert.equal(partial.totalUsd, 0.01)
  assert.equal(partial.partial, true)
  assert.equal(
    formatCost(
      responseUsage("answer", messages, viewOf([{ turn: "t1", cost: 0 }]))
        .totalUsd
    ),
    "$0.0000"
  )
  assert.equal(formatCost(0.000001), "<$0.0001")
  assert.equal(
    responseUsage("missing", messages, emptySessionView()).totalUsd,
    null
  )
})

test("legacy replies keep model attribution without inventing unrecorded costs", () => {
  const view = viewOf(
    [{ turn: "t1", cost: undefined }],
    [
      {
        turn: "t1",
        id: "legacy-image",
        name: "edit_story",
        output: { design: { path: "uploads/old.jpg" } },
      },
    ]
  )
  const result = responseUsage("answer", [message("answer", "t1")], view)
  assert.equal(result.partial, true)
  assert.equal(result.totalUsd, null)
  assert.deepEqual(
    result.models.map((entry) => entry.model),
    [MAIN, "Story image (model unavailable)"]
  )
})

test("compaction costs belong to their turn and legacy text maps to its original run", () => {
  const view = viewOf([
    { turn: "old", cost: 3, model: FAST },
    { turn: "answer", cost: 0.01, partId: "answer-text" },
    { turn: "answer", cost: 0.002, model: FAST, change: "compaction" },
  ])
  const current = responseUsage("answer", [message("answer", "answer")], view)
  assert.equal(formatCost(current.totalUsd), "$0.0120")
  assert.deepEqual(
    current.models.map((entry) => entry.model),
    [MAIN, FAST]
  )
  const legacy = responseUsage(
    "legacy",
    [
      {
        id: "legacy",
        role: "assistant",
        parts: [{ id: "answer-text", type: "text", text: "Answer" }],
      },
    ],
    view
  )
  assert.equal(legacy.totalUsd, 0.01)
  assert.equal(legacy.models[0].model, MAIN)
})

test("OpenRouter receipts reach eve for both generate and finish chunks without changing provider identity", async () => {
  for (const cost of [0, 0.002, undefined, NaN, -1]) {
    const metadata = { openrouter: { usage: { cost, promptTokens: 10 } } }
    const wrapped = wrapLanguageModel({
      middleware: openRouterUsage,
      model: {
        specificationVersion: "v4",
        provider: "openrouter",
        modelId: MAIN,
        supportedUrls: {},
        doGenerate: async () => ({ content: [], providerMetadata: metadata }),
        doStream: async () => ({
          stream: new ReadableStream({
            start(controller) {
              controller.enqueue({
                type: "text-delta",
                id: "text",
                delta: "hello",
              })
              controller.enqueue({ type: "finish", providerMetadata: metadata })
              controller.close()
            },
          }),
        }),
      },
    })
    assert.equal(wrapped.provider, "openrouter")
    assert.equal(wrapped.modelId, MAIN)
    const generated = await wrapped.doGenerate({ prompt: [] })
    const streamed = await wrapped.doStream({ prompt: [] })
    const chunks = await Array.fromAsync(streamed.stream)
    assert.equal(chunks[0].delta, "hello")
    for (const received of [
      generated.providerMetadata,
      chunks[1].providerMetadata,
    ]) {
      assert.equal(received.openrouter, metadata.openrouter)
      assert.equal(
        received.gateway?.cost,
        Number.isFinite(cost) && cost >= 0 ? cost : undefined
      )
    }
  }
})
