import { z } from "zod"
import { isViewablePath } from "./photo-lines"
import {
  STORY_BACKGROUND_RULE,
  STORY_FRAME,
  type DecodedImage,
} from "./story-images"

export const STORY_EDIT_MODEL = "black-forest-labs/flux-3-image-klein"
export const STORY_EDIT_LINE = "Story edit"
export const STORY_REGIONS_MAX = 12

/** BFL's axis order: top, left, bottom, right; each axis runs 0–1000. */
const coordinate = z.number().int().min(0).max(1000)
// A homogeneous array stays valid in draft 2020-12 when eve emits draft-07.
// A Zod tuple would emit `items: []`, which Anthropic rejects for every turn.
export const storyBox = z
  .array(coordinate)
  .length(4)
  .refine(([top, left, bottom, right]) => bottom > top && right > left, {
    message: "Give the region a width and height.",
  })
  .transform(([top, left, bottom, right]): [number, number, number, number] => [
    top,
    left,
    bottom,
    right,
  ])
export type StoryBox = z.infer<typeof storyBox>

export const storyRegion = z
  .object({
    operation: z.enum(["change", "add", "remove", "move"]),
    box: storyBox,
    target: storyBox.nullable().default(null),
    instruction: z.string().trim().max(1000).default(""),
  })
  .refine((row) => row.operation !== "move" || row.target !== null, {
    message: "Choose where to move this region.",
  })
  .refine(
    (row) =>
      !["change", "add"].includes(row.operation) || row.instruction.length > 0,
    { message: "Describe the change for each region." }
  )
export type StoryRegion = z.infer<typeof storyRegion>

const mediaPath = z
  .string()
  .refine(isViewablePath, "Use a media-library photo.")
export const storyEditInput = z
  .object({
    image: mediaPath,
    instructions: z.string().trim().max(2000).default(""),
    regions: z.array(storyRegion).max(STORY_REGIONS_MAX).default([]),
    photos: z.array(mediaPath).max(9).default([]),
  })
  .refine(
    (input) => input.instructions.length > 0 || input.regions.length > 0,
    {
      message: "Describe a change or select a region.",
    }
  )
export type StoryEditInput = z.infer<typeof storyEditInput>

/** Pointer coordinates refer to the displayed image, never the viewport. */
export function storyPoint(
  x: number,
  y: number,
  width: number,
  height: number
) {
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  )
    return null
  const axis = (value: number, size: number) =>
    Math.max(0, Math.min(1000, Math.round((value / size) * 1000)))
  return [axis(x, width), axis(y, height)] as const
}

export function storyBoxFromPoints(
  a: readonly number[],
  b: readonly number[]
): StoryBox {
  return [
    Math.min(a[1], b[1]),
    Math.min(a[0], b[0]),
    Math.max(a[1], b[1]),
    Math.max(a[0], b[0]),
  ]
}

export function storyBoxStyle([top, left, bottom, right]: StoryBox) {
  return {
    top: `${top / 10}%`,
    left: `${left / 10}%`,
    height: `${(bottom - top) / 10}%`,
    width: `${(right - left) / 10}%`,
  }
}

/** Arrow keys move a box; Shift+arrows resize it without exposing coordinates. */
export function adjustStoryBox(
  box: StoryBox,
  key: string,
  resize = false
): StoryBox {
  const [top, left, bottom, right] = box
  const dx = key === "ArrowLeft" ? -10 : key === "ArrowRight" ? 10 : 0
  const dy = key === "ArrowUp" ? -10 : key === "ArrowDown" ? 10 : 0
  if (resize)
    return [
      top,
      left,
      Math.min(1000, Math.max(top + 15, bottom + dy)),
      Math.min(1000, Math.max(left + 15, right + dx)),
    ]
  const x = Math.max(-left, Math.min(1000 - right, dx))
  const y = Math.max(-top, Math.min(1000 - bottom, dy))
  return [top + y, left + x, bottom + y, right + x]
}

/** Source/target rows follow BFL's documented keep/move/new/remove grammar. */
function editPrompt(input: StoryEditInput, frame: "story" | "photo") {
  const rows = input.regions.map((row, index) => {
    const fresh = row.operation === "change" || row.operation === "add"
    return {
      id: `region_${index + 1}`,
      from: fresh ? null : "ref_image_0",
      src_bbox: fresh ? null : row.box,
      tgt_bbox:
        row.operation === "remove"
          ? null
          : row.operation === "move"
            ? row.target
            : row.box,
      desc:
        row.instruction ||
        (row.operation === "remove"
          ? "Remove the content in this source region and restore the surrounding background."
          : "The existing content in this source region, unchanged in appearance."),
    }
  })
  const names = rows.map((row) => `<${row.id}>`).join(", ")
  const commands = input.regions
    .map((row, index) => {
      const id = `<region_${index + 1}>`
      if (row.operation === "change")
        return `Replace or modify only the existing content in ${id}'s target box as described.`
      if (row.operation === "add")
        return `Add ${id} in its target box; retain existing surrounding content.`
      if (row.operation === "remove")
        return `Remove ${id} from its source box and restore that background.`
      return `Move or resize ${id} from its source box to its target box, keeping its appearance and restoring the vacated background.`
    })
    .join(" ")
  return [
    frame === "story"
      ? "Edit the existing Instagram story in <ref_image_0>. This is the complete current design, not a style reference. Apply only the requested changes; do not redesign it."
      : "Edit the original photo in <ref_image_0>. Apply only the requested changes.",
    input.instructions,
    commands,
    rows.length
      ? `Edit ${names} using the element table below. Boxes use [top, left, bottom, right] on a 0–1000 grid. A New row replaces or adds content in its target box; a Remove row clears its source box and reconstructs the background; a Move row moves that content to its target box and restores the vacated background. Keep every unlisted element and everything outside the edited regions unchanged.`
      : "Keep all unmentioned content, layout, colours, typography, and lighting unchanged.",
    frame === "story"
      ? `Keep the canvas ${STORY_FRAME.width} × ${STORY_FRAME.height}, 9:16. Preserve the Q Audio logo exactly, all unchanged text and numbers, and the identity and finish of every product. Do not invent facts or prices. Keep new text and readable logos between y=${STORY_FRAME.top} and y=${STORY_FRAME.height - STORY_FRAME.bottom}, at least ${STORY_FRAME.side}px from either side.`
      : "Match the source photo's aspect ratio and framing. Preserve unchanged product details, labels, logos, colors, and finishes.",
    frame === "story" ? STORY_BACKGROUND_RULE : "",
    input.photos.length
      ? "Further references supply only the objects or artwork requested by the owner; preserve the first image's composition."
      : "",
    rows.length ? JSON.stringify(rows) : "",
  ]
    .filter(Boolean)
    .join("\n\n")
}

export function storyEditPrompt(input: StoryEditInput) {
  return editPrompt(input, "story")
}

function editRequest(
  prompt: string,
  aspect_ratio: "9:16" | "auto",
  urls: string[]
) {
  return {
    model: STORY_EDIT_MODEL,
    prompt,
    resolution: "2K",
    aspect_ratio,
    output_format: "jpeg",
    n: 1,
    input_references: urls.map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  }
}

export function photoEditRequest(input: StoryEditInput, source: string) {
  return editRequest(editPrompt(input, "photo"), "auto", [source])
}

/** Klein has no GPT quality/background fields; 2K retains this 1920px frame. */
export function storyEditRequest(
  input: StoryEditInput,
  source: string,
  photoUrl: (path: string) => string
) {
  return editRequest(storyEditPrompt(input), "9:16", [
    source,
    ...[...new Set(input.photos)]
      .filter((path) => path !== input.image)
      .map(photoUrl),
  ])
}

/** Keep the whole returned design, extending its scene rather than adding bars. */
export function storyBackgroundRequest(image: DecodedImage) {
  const { width, height, top, bottom, side } = STORY_FRAME
  const scale = Math.min(
    (width - 2 * side) / image.width,
    (height - top - bottom) / image.height
  )
  const w = image.width * scale
  const h = image.height * scale
  const x = (width - w) / 2
  const y = top + (height - top - bottom - h) / 2
  const box: StoryBox = [
    Math.round((y / height) * 1000),
    Math.round((x / width) * 1000),
    Math.round(((y + h) / height) * 1000),
    Math.round(((x + w) / width) * 1000),
  ]
  return {
    model: STORY_EDIT_MODEL,
    aspect_ratio: "9:16",
    resolution: "2K",
    output_format: "jpeg",
    n: 1,
    input_references: [
      {
        type: "image_url",
        image_url: {
          url: `data:${image.mediaType};base64,${Buffer.from(image.bytes).toString("base64")}`,
        },
      },
    ],
    prompt: [
      `Extend the background of the existing story in <ref_image_0> into one continuous full-bleed 9:16 canvas, ${width} × ${height}. Keep the entire existing design <design_1> in its target box, including every word, number, logo, and product, without cropping or changing their appearance or proportions. The target box keeps all existing lettering clear of Instagram's interface.`,
      "Generate only the surrounding continuation of the existing background and decorative scene, matching its materials, texture, lighting, and colours. Seamlessly integrate the reference's edges with the new scene. Do not duplicate text, logos, or products, add text or facts, mirror the poster, or blur a copy of it to fill the frame.",
      STORY_BACKGROUND_RULE,
      JSON.stringify([
        {
          id: "design_1",
          from: "ref_image_0",
          src_bbox: [0, 0, 1000, 1000],
          tgt_bbox: box,
          desc: "The complete original story design, with its wording, logo, products, colours, and visual detail preserved.",
        },
      ]),
    ].join("\n\n"),
  }
}

/** The selected version and exact boxes survive the chat round trip. */
export function storyEditMessage(input: StoryEditInput) {
  const notes = input.regions.map(
    (row, index) =>
      `Region ${index + 1}: ${row.instruction || (row.operation === "remove" ? "Remove" : "Move to the selected destination")}.`
  )
  return [
    input.instructions || "Apply these changes to the story image.",
    ...notes,
    `${STORY_EDIT_LINE}: ${JSON.stringify(input)}`,
  ].join("\n")
}

export function readStoryEdit(text: string): StoryEditInput | null {
  const match = text.match(/^Story edit: (.+)$/m)
  if (!match || match[1].length > 100_000) return null
  try {
    const result = storyEditInput.safeParse(JSON.parse(match[1]))
    return result.success ? result.data : null
  } catch {
    return null
  }
}
