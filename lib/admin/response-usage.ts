import { calls, parts, runs, type SessionView } from "eve/events"
import { flowById, flowProgressSchema, FLOW_TOOL, type Flow } from "./flows"
import { validCost } from "./model-cost"
import { previewToolName } from "./tool-names"

type Message = {
  readonly id: string
  readonly role: string
  readonly metadata?: { readonly turnId?: string }
  readonly parts: readonly unknown[]
}

export type ResponseUsage = {
  scope: "flow" | "response"
  totalUsd: number | null
  partial: boolean
  models: { model: string; costUsd: number | null; partial: boolean }[]
}

/** Tools that report their own paid requests' receipts as `usage`, with
 * what a call without one is listed as. */
const PAID_TOOLS = new Map([
  ["design_story", "Story image (model unavailable)"],
  ["edit_story", "Story image (model unavailable)"],
  ["googlebusiness__design_offer", "Google Offer image (model unavailable)"],
  ["products__read_manufacturer_page", "Product page read (unavailable)"],
])

/**
 * Scope a reply to its turn, or to the flow it continues across steering,
 * edits and approvals. A completed flow ends before the next user message;
 * a later run of the same flow is a separate scope. Never use session totals.
 */
function replyScope(id: string, messages: readonly Message[]) {
  let flow: {
    definition: Flow
    turns: Set<string>
    calls: Set<string>
    ended: boolean
    step?: string
  } | null = null
  for (const message of messages) {
    if (message.role === "user" && flow?.ended) flow = null
    const turnId = message.metadata?.turnId
    for (const value of message.parts) {
      const part = value as Record<string, unknown>
      if (part.type !== "tool" || typeof part.name !== "string") continue
      if (
        part.name === FLOW_TOOL &&
        !["failed", "rejected", "cancelled"].includes(String(part.state))
      ) {
        const input = flowProgressSchema.safeParse(part.input).data
        if (input) {
          if (
            input.status === "active" &&
            (!flow || flow.ended || flow.definition.id !== input.flow)
          ) {
            flow = {
              definition: flowById(
                input.flow,
                input.step ? undefined : part.output
              )!,
              turns: new Set(),
              calls: new Set(),
              ended: false,
            }
          }
          if (flow && input.status === "active") flow.step = input.step
          if (
            flow?.definition.id === input.flow &&
            ["done", "stopped"].includes(input.status)
          )
            flow.ended = true
        }
      }
      if (flow) {
        if (typeof part.callId === "string") flow.calls.add(part.callId)
        const final = flow.definition.steps.at(-1)
        const last = final?.tool
        if (
          last &&
          (last === part.name ||
            previewToolName(last) === previewToolName(part.name)) &&
          part.state === "completed" &&
          (final.id !== "google" ||
            (flow.step === "google" &&
              (part.input as { kind?: unknown } | undefined)?.kind === "offer"))
        )
          flow.ended = true
      }
    }
    if (flow && turnId) flow.turns.add(turnId)
    if (message.id === id) {
      return {
        scope: flow ? ("flow" as const) : ("response" as const),
        turns: flow?.turns ?? new Set(turnId ? [turnId] : []),
        calls:
          flow?.calls ??
          new Set(
            message.parts.flatMap((value) => {
              const part = value as Record<string, unknown>
              return part.type === "tool" && typeof part.callId === "string"
                ? [part.callId]
                : []
            })
          ),
        parts: new Set(
          message.parts.flatMap((value) => {
            const part = value as Record<string, unknown>
            return typeof part.id === "string" ? [part.id] : []
          })
        ),
      }
    }
  }
  return null
}

/** Read on opening Info, so streaming never scans all usage/content tables. */
export function responseUsage(
  id: string,
  messages: readonly Message[],
  view: SessionView
): ResponseUsage {
  const scope = replyScope(id, messages)
  const totals = new Map<
    string,
    { cost: number; known: boolean; missing: boolean }
  >()
  const add = (model: string | undefined, cost: unknown) => {
    const name = model || "Model unavailable"
    const entry = totals.get(name) ?? { cost: 0, known: false, missing: false }
    if (validCost(cost)) {
      entry.cost += cost
      entry.known = true
    } else entry.missing = true
    totals.set(name, entry)
  }
  if (scope) {
    const legacyRuns = new Set(
      scope.turns.size
        ? []
        : parts(view)
            .filter((part) => scope.parts.has(part.partId))
            .map((part) => part.runId)
    )
    for (const run of runs(view)) {
      if (
        !(run.turnId && scope.turns.has(run.turnId)) &&
        !legacyRuns.has(run.runId)
      )
        continue
      if (run.usage || run.startedAt) add(run.modelId, run.usage?.costUsd)
    }
    for (const call of calls(view)) {
      if (
        !(call.turnId && scope.turns.has(call.turnId)) &&
        !scope.calls.has(call.callId)
      )
        continue
      // Parent-session runs exclude child runs. Count their cost once, but
      // don't label historical calls with today's configured model.
      if (call.usage)
        add(
          call.name === "copywriter"
            ? "Copywriter (model unavailable)"
            : "Delegated models (attribution unavailable)",
          call.usage.costUsd
        )
      if (!PAID_TOOLS.has(call.name)) continue
      const output = call.output as
        { usage?: { model?: string; costUsd?: unknown }[] } | undefined
      if (Array.isArray(output?.usage) && output.usage.length > 0) {
        for (const item of output.usage) add(item.model, item.costUsd)
      } else if (call.startedAt) {
        add(PAID_TOOLS.get(call.name), null)
      }
    }
  }
  const models = [...totals].map(([model, entry]) => ({
    model,
    costUsd: entry.known ? entry.cost : null,
    partial: entry.missing,
  }))
  const known = models.filter((entry) => entry.costUsd !== null)
  return {
    scope: scope?.scope ?? "response",
    totalUsd: known.length
      ? known.reduce((sum, entry) => sum + entry.costUsd!, 0)
      : null,
    partial: !models.length || models.some((entry) => entry.partial),
    models,
  }
}

export function formatCost(cost: number | null) {
  if (cost === null) return "Unavailable"
  if (cost > 0 && cost < 0.0001) return "<$0.0001"
  return `$${cost.toFixed(4)}`
}
