import { defineTool } from "eve/tools"
import { taskPlanSchema } from "../../lib/admin/task-plan"

export default defineTool({
  description:
    "Create or update the owner's task checklist, only for a request with at least 3 distinct requested tasks outside preset flows. Count requested outcomes, not tool calls, preparation, verification, or a flow's built-in steps. Never use for a flow or for 1-2 tasks. Send the full snapshot with stable plan and task ids each time. Keep at most one task in_progress. Mark completed only after the actual work succeeds, never for a proposed or unapproved save. Mark failures or unavailable work blocked with a short reason. This only displays progress; it never changes the site or approves a tool.",
  inputSchema: taskPlanSchema,
  outputSchema: taskPlanSchema,
  availableInSubagents: false,
  label: { start: () => "Updating tasks" },
  async execute(plan) {
    return plan
  },
})
