import { z } from "zod"
import { FLOW_TOOL, flowState } from "./flows"

export const PLAN_TOOL = "update_plan"
export const MIN_PLAN_TASKS = 3

export const taskPlanSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .describe(
        "Stable id for this request's plan. Use a new id for a new request."
      ),
    tasks: z
      .array(
        z.object({
          id: z.string().trim().min(1).max(40),
          title: z.string().trim().min(1).max(140),
          status: z.enum(["pending", "in_progress", "completed", "blocked"]),
          reason: z.string().trim().min(1).max(240).optional(),
        })
      )
      .min(MIN_PLAN_TASKS)
      .max(12),
  })
  .superRefine(({ tasks }, ctx) => {
    if (new Set(tasks.map((task) => task.id)).size !== tasks.length)
      ctx.addIssue({ code: "custom", message: "Task ids must be unique." })
    if (tasks.filter((task) => task.status === "in_progress").length > 1)
      ctx.addIssue({
        code: "custom",
        message: "Only one task can be in progress.",
      })
    tasks.forEach((task, index) => {
      if (task.status === "blocked" && !task.reason)
        ctx.addIssue({
          code: "custom",
          path: ["tasks", index, "reason"],
          message: "Explain what is blocking this task.",
        })
    })
  })

export type TaskPlan = z.infer<typeof taskPlanSchema>
export type PlanTask = TaskPlan["tasks"][number]

type Message = { readonly role: string; readonly parts: readonly unknown[] }

const snapshots = new WeakMap<object, TaskPlan | null>()

function snapshot(output: unknown) {
  if (!output || typeof output !== "object") return null
  if (!snapshots.has(output))
    snapshots.set(output, taskPlanSchema.safeParse(output).data ?? null)
  return snapshots.get(output) ?? null
}

/** Successful tool outputs are durable; streaming inputs aren't a plan. */
export function taskPlanState(messages: readonly Message[]): TaskPlan | null {
  let plan: TaskPlan | null = null
  for (const message of messages) {
    if (message.role === "user") {
      if (plan?.tasks.every((task) => task.status === "completed")) plan = null
      continue
    }
    if (message.role !== "assistant") continue
    for (const item of message.parts) {
      if (!item || typeof item !== "object") continue
      const part = item as Record<string, unknown>
      if (part.type !== "tool" || part.state !== "completed") continue
      // Starting a flow replaces any earlier ad-hoc plan, even after the
      // flow finishes and its stepper has gone away.
      if (part.name === FLOW_TOOL) plan = null
      if (part.name !== PLAN_TOOL) continue
      const next = snapshot(part.output)
      if (next) plan = next
    }
  }
  return flowState(messages)?.status === "active" ? null : plan
}
