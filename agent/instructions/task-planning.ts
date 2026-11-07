import { defineDynamic, defineInstructions } from "eve/instructions"
import { taskPlanningInstruction } from "../lib/task-planning"

export default defineDynamic((ctx) => {
  const content = taskPlanningInstruction(
    ctx.model.id,
    ctx.view,
    ctx.turn?.id ?? null,
    Boolean(ctx.session.parent)
  )
  return content ? defineInstructions({ content }) : null
})
