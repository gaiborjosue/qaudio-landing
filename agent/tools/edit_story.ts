import { defineWorkflowTool, type WorkflowStepToolContext } from "eve/tools"
import {
  storyEditInput,
  type StoryEditInput,
} from "../../lib/admin/story-edits"
import { editStory } from "../lib/story"
import { reviewStory } from "../lib/story-review"
import type { StoryOutput } from "./design_story"

export default defineWorkflowTool({
  description:
    "Edit an existing designed Instagram story using FLUX 3 Image Klein, never GPT Image. Send the exact current design path and the owner's changes. Optional regions use [top,left,bottom,right] integers 0–1000; copy the owner's Story edit payload exactly, including source and move destinations. With no regions, apply whole-image feedback. Additional photos supply requested replacement objects only. Pauses on the new 1080 × 1920 design for Continue or further feedback. Only review continued means propose it with instagram__save_post, preserving account, post id, and timing; changes_requested means edit this new image again with that feedback, and interrupted means stop. Costs money: only edit when asked, and never automatically retry a failed or uncertain request.",
  inputSchema: storyEditInput,
  label: {
    start: () => "Edit the story",
    complete: (_input, output) =>
      (output as StoryOutput | null)?.status === "ready"
        ? "Edited the story"
        : "Couldn't edit the story",
  },
  async *execute(input, ctx): AsyncGenerator<StoryOutput, StoryOutput> {
    "use workflow"
    const started = await clock()
    yield { status: "designing", started_at: started, count: 1 }
    const result = await edit(input, ctx)
    if ("problem" in result)
      return { status: "failed", problem: result.problem, usage: result.usage }
    const [image] = result.images
    const output: StoryOutput = {
      status: "ready" as const,
      started_at: started,
      count: 1,
      images: [image],
      design: image,
      usage: result.usage,
      review: "waiting" as const,
    }
    yield output
    const review = await reviewStory(ctx)
    return { ...output, ...review }
  },
})

async function clock() {
  "use step"
  return Date.now()
}

async function edit(input: StoryEditInput, ctx: WorkflowStepToolContext) {
  "use step"
  return editStory(input, ctx)
}
