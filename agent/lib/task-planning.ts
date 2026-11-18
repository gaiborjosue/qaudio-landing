import type { LanguageModelMiddleware } from "ai"
import { calls, conversation, type SessionView } from "eve/events"
import { FLOW_TOOL, flowState } from "../../lib/admin/flows"
import { PLAN_MODEL_ID } from "../../lib/admin/model-cost"
import { PLAN_TOOL, taskPlanSchema } from "../../lib/admin/task-plan"

export const REQUIRE_TASK_PLAN =
  "This multi-task turn requires a checklist before domain tools or an answer. Call update_plan with the full checklist, including when all requested tasks are read-only questions or lookups. For a continuation, refresh the existing plan with the same ids. The only alternative is flow_progress when a preset flow really applies: run that flow first, never list its built-in steps as tasks, then plan the remaining work if it has at least three non-flow tasks. Do not call both helpers together."

export function taskPlanningInstruction(
  modelId: string,
  view: SessionView,
  turnId: string | null,
  delegated = false
): string | null {
  if (
    delegated ||
    !turnId ||
    modelId.replace(/^openai\//, "") !== PLAN_MODEL_ID.replace(/^openai\//, "")
  )
    return null

  const retained = new Set(conversation(view).map((turn) => turn.turnId))
  const history = calls(view).filter(
    (call) => call.turnId && retained.has(call.turnId)
  )
  if (
    history.some(
      (call) =>
        call.turnId === turnId &&
        call.name === PLAN_TOOL &&
        call.state === "completed" &&
        taskPlanSchema.safeParse(call.output).success
    )
  )
    return null

  const flow = flowState([
    {
      role: "assistant",
      parts: history.map((call) => ({ type: "tool", ...call })),
    },
  ])
  return flow?.status === "active" ? null : REQUIRE_TASK_PLAN
}

/** The dynamic instruction scopes this gate to the selected root turn. */
export const taskPlanningGate: LanguageModelMiddleware = {
  transformParams: async ({ params }) => {
    if (
      !params.prompt.some(
        (message) =>
          message.role === "system" &&
          message.content.includes(REQUIRE_TASK_PLAN)
      )
    )
      return params

    const tools = params.tools?.filter(
      (tool) =>
        tool.type === "function" &&
        (tool.name === PLAN_TOOL || tool.name === FLOW_TOOL)
    )
    if (!tools?.some((tool) => tool.name === PLAN_TOOL))
      throw new Error(
        "Task planning is required, but update_plan is unavailable."
      )

    return { ...params, tools, toolChoice: { type: "required" } }
  },
}

/** Eve's dynamic instructions see the model ID shared by both Sol routes. */
export const omitTaskPlanningInstruction: LanguageModelMiddleware = {
  transformParams: async ({ params }) => ({
    ...params,
    prompt: params.prompt.flatMap((message) => {
      if (
        message.role !== "system" ||
        !message.content.includes(REQUIRE_TASK_PLAN)
      ) {
        return [message]
      }
      const content = message.content.replace(REQUIRE_TASK_PLAN, "").trim()
      return content ? [{ ...message, content }] : []
    }),
  }),
}
