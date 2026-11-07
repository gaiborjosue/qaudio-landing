import type { WorkflowToolContext } from "eve/tools"
import { readStoryVersion } from "../../lib/admin/story-versions"

/**
 * A durable pause after each design, separate from permission to post it.
 * Continue may name an earlier version of the design (a `Story version:`
 * line); that version is then returned as the design to post.
 */
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
    const design = readStoryVersion(answer.text)
    return design
      ? { review: "continued" as const, design }
      : { review: "continued" as const }
  }
  return {
    review: "changes_requested" as const,
    feedback: answer.text ?? answer.optionId ?? "",
  }
}
