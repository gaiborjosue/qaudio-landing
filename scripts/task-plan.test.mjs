import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { registerHooks } from "node:module"
import { resolve } from "node:path"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import { conversationOf } from "eve/client"
import { emptySessionView, foldEvents } from "eve/events"
import { wrapLanguageModel } from "ai"

const root = fileURLToPath(new URL("../", import.meta.url))
const asModule = (source) => ({
  url: `data:text/javascript,${encodeURIComponent(source)}`,
  shortCircuit: true,
})

registerHooks({
  resolve(specifier, context, next) {
    // Capture the public auto config without spending money on a router.
    if (specifier === "eve/models")
      return asModule("export const auto = (config) => config")
    if (specifier === "eve/models/openai")
      return asModule(`
        export const chatgpt = (modelId) => ({
          modelId, provider: "chatgpt-test", specificationVersion: "v4",
          supportedUrls: {},
          doGenerate: async () => { throw new Error("ChatGPT sign-in required") },
        })
      `)
    let candidate
    if (specifier.startsWith("@/"))
      candidate = resolve(root, specifier.slice(2))
    else if (
      specifier.startsWith(".") &&
      /\.ts(?:\?|$)/.test(context.parentURL ?? "")
    )
      candidate = fileURLToPath(new URL(specifier, context.parentURL))
    if (candidate) {
      for (const suffix of ["", ".ts", ".tsx"]) {
        if (
          existsSync(candidate + suffix) &&
          /\.(ts|tsx|css)$/.test(candidate + suffix)
        )
          return {
            url: pathToFileURL(candidate + suffix).href,
            shortCircuit: true,
          }
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
          source: "export default {}",
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

const { PLAN_TOOL, MIN_PLAN_TASKS, taskPlanSchema, taskPlanState } =
  await import("../lib/admin/task-plan.ts")
const { default: updatePlan } = await import("../agent/tools/update_plan.ts")
const { TaskQueue } = await import("../components/admin/task-queue.tsx")
const { FLOWS } = await import("../lib/admin/flows.ts")
const { PLAN_MODEL_ID, MAIN_MODEL_ID, FAST_MODEL_ID } =
  await import("../lib/admin/model-cost.ts")
const { REQUIRE_TASK_PLAN, taskPlanningInstruction, taskPlanningGate } =
  await import("../agent/lib/task-planning.ts")

const plan = (
  statuses = ["in_progress", "pending", "pending"],
  id = "request"
) => ({
  id,
  tasks: statuses.map((status, i) => ({
    id: `task-${i}`,
    title:
      ["Update Saturday hours", "Edit the QDeal", "Reorder speakers"][i] ??
      `Task ${i}`,
    status,
    ...(status === "blocked" && {
      reason: "Waiting for the owner's correction",
    }),
  })),
})
const owner = (text = "Do these things") => ({
  role: "user",
  parts: [{ type: "text", text }],
})
const call = (output, state = "completed", input = output) => ({
  role: "assistant",
  parts: [{ type: "tool", name: PLAN_TOOL, state, input, output }],
})
const flow = (status = "active", state = "completed") => ({
  role: "assistant",
  parts: [
    {
      type: "tool",
      name: "flow_progress",
      input: { flow: "product-sale", status },
      state,
    },
  ],
})

function planningEvents(entries = [], follows = "previous") {
  const events = []
  const emit = (type, data) =>
    events.push({
      type,
      data,
      meta: {
        position: { line: events.length + 1, index: 0 },
        at: "2026-11-07T04:09:38Z",
        endOfLine: true,
      },
    })
  for (const turnId of ["previous", "current"]) {
    emit("turn.started", {
      turnId,
      cause: { deliveryId: `d-${turnId}` },
      follows: turnId === "current" ? follows : null,
    })
    emit("model.requested", { runId: turnId, owner: { turnId } })
    emit("model.started", { runId: turnId, modelId: PLAN_MODEL_ID, attempt: 0 })
    for (const [index, entry] of entries.entries()) {
      if ((entry.turn ?? "current") !== turnId) continue
      const callId = `c-${index}`
      emit("call.requested", {
        callId,
        owner: { runId: turnId },
        capability: { kind: "tool", name: entry.name ?? PLAN_TOOL },
        input: entry.input ?? entry.output ?? {},
      })
      if (entry.outcome === "pending") continue
      emit("call.started", { callId })
      emit("call.settled", {
        callId,
        outcome: entry.outcome ?? "completed",
        output: entry.output,
        ...(entry.outcome === "failed" && { error: { message: "Failed" } }),
      })
    }
  }
  return events
}

test("the plan schema enforces the exact 3-task threshold and bounded, unambiguous snapshots", () => {
  assert.equal(MIN_PLAN_TASKS, 3)
  for (const size of [0, 1, 2, 13])
    assert.equal(
      taskPlanSchema.safeParse(plan(Array(size).fill("pending"))).success,
      false
    )
  for (const size of [3, 8, 12])
    assert.equal(
      taskPlanSchema.safeParse(plan(Array(size).fill("pending"))).success,
      true
    )
  for (const invalid of [
    { ...plan(), id: "" },
    { ...plan(), tasks: plan().tasks.map((task) => ({ ...task, id: "same" })) },
    plan(["in_progress", "in_progress", "pending"]),
    { ...plan(), tasks: plan().tasks.map((task) => ({ ...task, title: " " })) },
    plan(["unknown", "pending", "pending"]),
    {
      ...plan(),
      tasks: plan(["blocked", "pending", "pending"]).tasks.map((task) => ({
        ...task,
        reason: undefined,
      })),
    },
  ])
    assert.equal(taskPlanSchema.safeParse(invalid).success, false)
  assert.equal(
    taskPlanSchema.safeParse(plan(["completed", "blocked", "pending"])).success,
    true
  )
})

test("the tool only returns a snapshot, requires no site approval, and is root-only", async () => {
  const input = taskPlanSchema.parse(plan())
  assert.deepEqual(await updatePlan.execute(input), input)
  assert.equal(updatePlan.approval, undefined)
  assert.equal(updatePlan.availableInSubagents, false)
  assert.equal(updatePlan.deferred, undefined)
})

test("only successful validated outputs replace a plan, never inputs or failed calls", () => {
  const initial = plan()
  const next = plan(["completed", "in_progress", "pending"])
  assert.equal(taskPlanState([owner()]), null)
  assert.equal(
    taskPlanState([owner(), call(undefined, "streaming", initial)]),
    null
  )
  assert.equal(
    taskPlanState([owner(), call(undefined, "completed", initial)]),
    null
  )
  for (const state of [
    "streaming",
    "requested",
    "running",
    "blocked",
    "approval",
    "failed",
    "cancelled",
    "rejected",
  ])
    assert.deepEqual(
      taskPlanState([owner(), call(initial), call(next, state)]),
      initial
    )
  assert.deepEqual(taskPlanState([owner(), call(initial), call(next)]), next)
  assert.deepEqual(
    taskPlanState([owner(), call(initial), call({ id: "broken", tasks: [] })]),
    initial
  )
  assert.deepEqual(
    taskPlanState([
      owner(),
      call(initial),
      { role: "assistant", parts: [null, 1, "x"] },
    ]),
    initial
  )
  assert.equal(
    taskPlanState([{ role: "user", parts: call(initial).parts }]),
    null
  )
})

test("plans survive follow-ups, approvals, failures and replay; finished plans dismiss on the next request", () => {
  const started = plan()
  const blocked = plan(["completed", "blocked", "pending"])
  const finished = plan(["completed", "completed", "completed"])
  const history = [
    owner(),
    call(started),
    owner("Approved as: {}"),
    call(blocked),
  ]
  assert.deepEqual(taskPlanState(history), blocked)
  assert.deepEqual(taskPlanState(JSON.parse(JSON.stringify(history))), blocked)
  assert.deepEqual(
    taskPlanState([...history, owner("Try a shorter title")]),
    blocked
  )
  assert.deepEqual(taskPlanState([...history, call(finished)]), finished)
  assert.equal(
    taskPlanState([...history, call(finished), owner("Thanks")]),
    null
  )
  const replacement = plan(undefined, "new-request")
  assert.deepEqual(taskPlanState([...history, call(replacement)]), replacement)
  assert.equal(taskPlanState([]), null)
})

test("flows never display a parallel checklist and discard the earlier plan", () => {
  assert.equal(taskPlanState([owner(), flow(), call(plan())]), null)
  assert.equal(taskPlanState([owner(), call(plan()), flow()]), null)
  assert.equal(
    taskPlanState([owner(), call(plan()), flow(), flow("done")]),
    null
  )
  assert.equal(
    taskPlanState([
      owner(),
      call(plan()),
      flow(),
      flow("stopped"),
      owner("Thanks"),
    ]),
    null
  )
  assert.deepEqual(
    taskPlanState([owner(), call(plan()), flow("active", "failed")]),
    plan()
  )
  assert.deepEqual(
    taskPlanState([owner(), flow(), flow("done"), owner(), call(plan())]),
    plan()
  )
  // A mixed request can start its remaining non-flow work in the same turn,
  // after the flow has finished; its completed metadata must not hide it.
  assert.deepEqual(
    taskPlanState([owner(), flow(), flow("done"), call(plan())]),
    plan()
  )
})

test("a persisted Eve event stream reconstructs the latest successful plan", () => {
  const events = []
  const emit = (type, data) =>
    events.push({
      type,
      data,
      meta: {
        position: { line: events.length + 1, index: 0 },
        at: "2026-11-06T22:00:00Z",
        endOfLine: true,
      },
    })
  emit("turn.started", {
    turnId: "t",
    cause: { deliveryId: "d" },
    follows: null,
  })
  emit("model.requested", { runId: "r", owner: { turnId: "t" } })
  emit("model.started", { runId: "r", modelId: PLAN_MODEL_ID, attempt: 0 })
  emit("call.requested", {
    callId: "p",
    owner: { runId: "r" },
    capability: { kind: "tool", name: PLAN_TOOL },
  })
  emit("call.started", { callId: "p" })
  emit("call.settled", { callId: "p", outcome: "completed", output: plan() })
  const live = conversationOf(events)
  assert.deepEqual(taskPlanState(live.messages), plan())
  const replay = conversationOf(JSON.parse(JSON.stringify(events)))
  assert.deepEqual(taskPlanState(replay.messages), plan())
})

test("the Queue has accessible task sections, progress, blocked reasons, and only shimmers while busy", () => {
  const current = plan(["in_progress", "blocked", "completed"])
  const render = (busy) =>
    renderToStaticMarkup(createElement(TaskQueue, { plan: current, busy }))
  const busy = render(true)
  assert.match(busy, /aria-label="Agent tasks"/)
  assert.match(busy, /1 of 3 completed/)
  assert.match(busy, /2 to do/)
  assert.match(busy, /1 completed/)
  assert.match(busy, /Blocked: Waiting for the owner/)
  assert.match(busy, /aria-current="step"/)
  assert.match(busy, /data-status="running"/)
  assert.match(busy, /aria-expanded="true"/)
  assert.doesNotMatch(render(false), /data-status="running"/)
})

test("Sol requires a successful plan in this turn, including read-only requests and after replay", () => {
  const viewOf = (entries = [], follows) =>
    foldEvents(emptySessionView(), planningEvents(entries, follows))
  const required = (
    view,
    model = PLAN_MODEL_ID,
    turn = "current",
    delegated = false
  ) => taskPlanningInstruction(model, view, turn, delegated)
  assert.equal(required(viewOf()), REQUIRE_TASK_PLAN)
  assert.equal(required(viewOf(), "gpt-6.2-sol"), REQUIRE_TASK_PLAN)
  assert.equal(required(viewOf(), FAST_MODEL_ID), null)
  assert.equal(required(viewOf(), PLAN_MODEL_ID, null), null)
  assert.equal(required(viewOf(), PLAN_MODEL_ID, "current", true), null)
  for (const outcome of ["pending", "failed", "rejected", "interrupted"])
    assert.equal(
      required(viewOf([{ output: plan(), outcome }])),
      REQUIRE_TASK_PLAN
    )
  assert.equal(
    required(viewOf([{ output: { id: "invalid", tasks: [] } }])),
    REQUIRE_TASK_PLAN
  )
  assert.equal(
    required(viewOf([{ output: plan(), turn: "previous" }])),
    REQUIRE_TASK_PLAN
  )
  const events = planningEvents([{ output: plan() }])
  assert.equal(required(foldEvents(emptySessionView(), events)), null)
  assert.equal(
    required(
      foldEvents(emptySessionView(), JSON.parse(JSON.stringify(events)))
    ),
    null
  )

  const active = {
    name: "flow_progress",
    input: { flow: "news-instagram" },
    output: { flow: "news-instagram" },
  }
  assert.equal(required(viewOf([active])), null)
  assert.equal(required(viewOf([{ ...active, turn: "previous" }])), null)
  assert.equal(
    required(viewOf([{ ...active, turn: "previous" }], null)),
    REQUIRE_TASK_PLAN
  )
  assert.equal(
    required(viewOf([{ ...active, outcome: "failed" }])),
    REQUIRE_TASK_PLAN
  )
  assert.equal(
    required(
      viewOf([
        active,
        { ...active, input: { flow: "news-instagram", status: "done" } },
      ])
    ),
    REQUIRE_TASK_PLAN
  )
})

test("the reported three-question request must create a visible Queue before domain reads in generate and stream", async () => {
  const request =
    "What is my current schedule from my google business? also my latest news post from the website? and do I offer any paradigm products?"
  const snapshot = {
    id: "three-lookups",
    tasks: [
      {
        id: "hours",
        title: "Read Google Business hours",
        status: "in_progress",
      },
      { id: "news", title: "Read latest website news", status: "pending" },
      { id: "products", title: "Check Paradigm products", status: "pending" },
    ],
  }
  const received = []
  const wrapped = wrapLanguageModel({
    middleware: taskPlanningGate,
    model: {
      specificationVersion: "v4",
      provider: "test",
      modelId: PLAN_MODEL_ID,
      supportedUrls: {},
      async doGenerate(params) {
        received.push(params)
        return {
          content:
            params.toolChoice?.type === "required"
              ? [
                  {
                    type: "tool-call",
                    toolCallId: "plan",
                    toolName: PLAN_TOOL,
                    input: JSON.stringify(snapshot),
                  },
                ]
              : [{ type: "text", text: "An answer with no checklist" }],
        }
      },
      async doStream(params) {
        received.push(params)
        return {
          stream: new ReadableStream({
            start(controller) {
              controller.close()
            },
          }),
        }
      },
    },
  })
  const instruction = taskPlanningInstruction(
    PLAN_MODEL_ID,
    foldEvents(emptySessionView(), planningEvents()),
    "current"
  )
  const params = {
    prompt: [
      {
        role: "system",
        content: `Other trusted instructions.\n${instruction}`,
      },
      { role: "user", content: [{ type: "text", text: request }] },
    ],
    tools: [
      "eve__search",
      PLAN_TOOL,
      "flow_progress",
      "googlebusiness__get_location",
    ].map((name) => ({
      type: "function",
      name,
      inputSchema: { type: "object" },
    })),
    toolChoice: { type: "auto" },
  }
  const generated = await wrapped.doGenerate(params)
  await wrapped.doStream(params)
  for (const call of received) {
    assert.deepEqual(call.toolChoice, { type: "required" })
    assert.deepEqual(
      call.tools.map((tool) => tool.name),
      [PLAN_TOOL, "flow_progress"]
    )
  }
  const toolCall = generated.content[0]
  assert.equal(toolCall.toolName, PLAN_TOOL)
  const output = await updatePlan.execute(
    taskPlanSchema.parse(JSON.parse(toolCall.input))
  )
  const messages = conversationOf(planningEvents([{ output }])).messages
  const projected = taskPlanState(messages)
  assert.deepEqual(projected, snapshot)
  const html = renderToStaticMarkup(
    createElement(TaskQueue, { plan: projected, busy: true })
  )
  assert.match(html, /0 of 3 completed/)
  for (const task of snapshot.tasks) assert.ok(html.includes(task.title))
})

test("the planning gate leaves other calls alone and fails explicitly if its helper is missing", async () => {
  let received
  const wrapped = wrapLanguageModel({
    middleware: taskPlanningGate,
    model: {
      specificationVersion: "v4",
      provider: "test",
      modelId: PLAN_MODEL_ID,
      supportedUrls: {},
      async doGenerate(params) {
        received = params
        return { content: [] }
      },
    },
  })
  const params = {
    prompt: [
      { role: "user", content: [{ type: "text", text: REQUIRE_TASK_PLAN }] },
    ],
  }
  await wrapped.doGenerate(params)
  assert.equal(received, params)
  await assert.rejects(
    wrapped.doGenerate({
      prompt: [{ role: "system", content: REQUIRE_TASK_PLAN }],
    }),
    /update_plan is unavailable/
  )
})

test("Sol routing uses medium effort, shares the local ChatGPT guard, and never falls back from an auth error", async () => {
  const original = Object.fromEntries(
    ["DEBUG_DEV_MODE", "EVE_DEV", "NODE_ENV"].map((key) => [
      key,
      process.env[key],
    ])
  )
  let version = 0
  try {
    for (const [debug, eve, env, local] of [
      ["true", "1", "development", true],
      ["true", "1", "production", false],
      ["true", undefined, "development", false],
      ["TRUE", "1", "development", false],
      [undefined, "1", "development", false],
    ]) {
      for (const [key, value] of Object.entries({
        DEBUG_DEV_MODE: debug,
        EVE_DEV: eve,
        NODE_ENV: env,
      })) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      const { mainChatModel, planModel, mainModel, fastModel } = await import(
        `../agent/lib/models.ts?case=${version++}`
      )
      assert.equal(planModel.modelId, PLAN_MODEL_ID)
      assert.equal(mainModel.modelId, MAIN_MODEL_ID)
      assert.equal(fastModel.modelId, FAST_MODEL_ID)
      assert.equal(planModel.provider === "chatgpt-test", local)
      assert.equal(mainModel.provider === "chatgpt-test", local)
      assert.notEqual(fastModel.provider, "chatgpt-test")
      assert.equal(mainChatModel.options[PLAN_MODEL_ID].model, planModel)
      assert.equal(mainChatModel.options[PLAN_MODEL_ID].reasoning, "medium")
      assert.equal(mainChatModel.options["sol-low"].model, mainModel)
      assert.equal(mainChatModel.options[FAST_MODEL_ID].model, fastModel)
      assert.equal(mainChatModel.options[FAST_MODEL_ID].reasoning, "xhigh")
      assert.match(
        mainChatModel.options[FAST_MODEL_ID].description,
        /Google Business/
      )
      assert.match(
        mainChatModel.options[FAST_MODEL_ID].description,
        /Do not use for 3 or more distinct requested tasks/
      )
      assert.equal(mainChatModel.options["sol-low"].reasoning, "low")
      assert.equal(mainChatModel.fallback.model, mainModel)
      assert.equal(mainChatModel.fallback.reasoning, "low")
      for (const flow of FLOWS)
        assert.ok(
          mainChatModel.options["sol-low"].description.includes(
            flow.trigger
          )
        )
      if (local)
        await assert.rejects(
          planModel.doGenerate({ prompt: [] }),
          /ChatGPT sign-in required/
        )
    }
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})

test("production requests use Sol medium and Ember xhigh through OpenRouter with cost receipts", async () => {
  const keys = ["NODE_ENV", "DEBUG_DEV_MODE", "EVE_DEV", "OPENROUTER_API_KEY"]
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]])
  )
  const originalFetch = globalThis.fetch
  const requests = []
  try {
    process.env.NODE_ENV = "production"
    process.env.DEBUG_DEV_MODE = "true"
    process.env.EVE_DEV = "1"
    process.env.OPENROUTER_API_KEY = "test-only-placeholder"
    globalThis.fetch = async (url, init) => {
      assert.equal(new URL(url).hostname, "openrouter.ai")
      const request = JSON.parse(init.body)
      requests.push(request)
      return Response.json({
        id: "test",
        object: "chat.completion",
        created: 1,
        model: request.model,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Done" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
          cost: 0.002,
        },
      })
    }
    const { planModel, mainModel, fastModel } =
      await import("../agent/lib/models.ts?case=production-request")
    const result = await planModel.doGenerate({
      prompt: [
        { role: "system", content: REQUIRE_TASK_PLAN },
        { role: "user", content: [{ type: "text", text: "Test" }] },
      ],
      tools: ["eve__search", PLAN_TOOL, "flow_progress"].map((name) => ({
        type: "function",
        name,
        inputSchema: { type: "object" },
      })),
    })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].model, PLAN_MODEL_ID)
    assert.equal(requests[0].reasoning.effort, "medium")
    assert.equal(requests[0].usage.include, true)
    assert.equal(requests[0].tool_choice, "required")
    assert.deepEqual(
      requests[0].tools.map((tool) => tool.function.name),
      [PLAN_TOOL, "flow_progress"]
    )
    assert.equal(result.providerMetadata.openrouter.usage.cost, 0.002)
    assert.equal(result.providerMetadata.gateway.cost, 0.002)
    await mainModel.doGenerate({
      prompt: [
        { role: "system", content: REQUIRE_TASK_PLAN },
        { role: "user", content: [{ type: "text", text: "Test" }] },
      ],
    })
    const lowRequest = requests.pop()
    assert.equal(lowRequest.model, MAIN_MODEL_ID)
    assert.equal(lowRequest.reasoning.effort, "low")
    assert.ok(!JSON.stringify(lowRequest.messages).includes(REQUIRE_TASK_PLAN))
    const fastResult = await fastModel.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hello" }] }],
    })
    assert.equal(requests.length, 2)
    assert.equal(requests[1].model, "meta/muse-ember")
    assert.equal(requests[1].reasoning.effort, "xhigh")
    assert.equal(requests[1].usage.include, true)
    assert.equal(fastResult.providerMetadata.openrouter.usage.cost, 0.002)
    assert.equal(fastResult.providerMetadata.gateway.cost, 0.002)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
})
