import type { WorkflowToolContext } from "eve/tools"

/** A durable pause after each design, separate from permission to post it. */
export async function reviewStory(ctx: WorkflowToolContext) {
  "use workflow"
  const answer = await ctx.ask({
    title: "Story design",
    prompt: "Continue with this design, or edit the image first.",
    display: "confirmation",
    allowFreeform: true,
    options: [{ id: "continue", label: "Continue", style: "primary" }],
  })
  if (answer.status !== "answered") {
    return { review: "interrupted" as const }
  }
  if (answer.optionId === "continue") {
    return { review: "continued" as const }
  }
  return {
    review: "changes_requested" as const,
    feedback: answer.text ?? answer.optionId ?? "",
  }
}
