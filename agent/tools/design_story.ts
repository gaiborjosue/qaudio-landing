import { defineWorkflowTool, type WorkflowStepToolContext } from "eve/tools"
import { z } from "zod"
import { isViewablePath } from "../../lib/admin/photo-lines"
import { STORY_PHOTOS_MAX, type StoryImage } from "../../lib/admin/story-images"
import { designStory } from "../lib/story"
import { reviewStory } from "../lib/story-review"
import type { ModelCost } from "../../lib/admin/model-cost"

// Designs an Instagram story with the image model (lib/admin/story-images.ts):
// one design, fitted to Instagram's 1080 × 1920 frame, which the chat shows
// as it's made, then pauses for Continue or edit feedback. Posting still
// needs its own approval. The paid request runs once, in a
// step that never throws, and progress reaches the chat as it goes.

export type StoryOutput =
  | { status: "designing"; started_at: number; count: number }
  | {
      status: "ready"
      started_at: number
      count: number
      images: StoryImage[]
      /** The design, for the story: its path and size. */
      design: StoryImage
      usage: ModelCost[]
      review: "waiting" | "continued" | "changes_requested" | "interrupted"
      feedback?: string
    }
  | { status: "failed"; problem: string; usage?: ModelCost[] }

export default defineWorkflowTool({
  description:
    "Create the FIRST Instagram story image with GPT Image: one vertical 1080 × 1920 design with the Q Audio logo, from your brief and the owner's photos. Pauses on the design for the owner's Continue or edit feedback. Only review continued means propose it with instagram__save_post as a story; changes_requested means edit_story with that image and feedback instead, and interrupted means stop. For ALL changes use edit_story (FLUX Klein), never call this again for revisions. Takes about half a minute and costs money: use it only for a sale story or when the owner asks for a new designed story. Never automatically retry a failed or uncertain request.",
  inputSchema: z.object({
    brief: z
      .string()
      .trim()
      .min(20)
      .max(2000)
      .describe(
        "What the story says and shows: the headline and any other words exactly as they should read (few), the offer, products, prices, and dates as given, and the look."
      ),
    photos: z
      .array(
        z
          .string()
          .refine(
            isViewablePath,
            "A photo path under uploads/, products/, news/, or instagram/."
          )
      )
      .max(STORY_PHOTOS_MAX)
      .default([])
      .describe(
        "Reference photos (media paths): the promotion graphic or news cover and product photos for the first design. For revisions use edit_story instead. The logo is always added."
      ),
    address: z
      .boolean()
      .default(true)
      .describe("Show the shop's address small near the bottom."),
  }),
  label: {
    start: () => "Design the story",
    complete: (_input, output) =>
      (output as StoryOutput | null)?.status === "ready"
        ? "Designed the story"
        : "Couldn't design the story",
  },
  async *execute(input, ctx): AsyncGenerator<StoryOutput, StoryOutput> {
    "use workflow"
    const started = await clock()
    yield { status: "designing", started_at: started, count: 1 }
    const result = await design(input, ctx)
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

/** When the design started, for the chat's progress; a step, so replays
 * keep it. */
async function clock() {
  "use step"
  return Date.now()
}

async function design(
  input: { brief: string; photos: string[]; address: boolean },
  ctx: WorkflowStepToolContext
) {
  "use step"
  return designStory(input, ctx)
}
