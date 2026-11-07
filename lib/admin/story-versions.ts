import { isPrivateUpload } from "./media-lifecycle"
import { STORY_FRAME, type StoryImage } from "./story-images"

// Versions of a story design: the first design_story image, then each
// edit_story result made from one of them. The chat numbers them, and the
// owner may Continue with an earlier one; the review step (agent/lib/
// story-review.ts) then returns that version as the design to post.
// Relative imports, because the agent imports this too.

export const STORY_VERSION_LINE = "Story version"

/** A story call's own result: its one design, or an older chat's pick. */
export function madeStory(output: unknown): StoryImage | undefined {
  if (!output || typeof output !== "object") return undefined
  const { images, design, chosen } = output as {
    images?: StoryImage[]
    design?: StoryImage
    chosen?: StoryImage
  }
  return images?.length === 1 ? images[0] : (chosen ?? design)
}

export type StoryVersions = {
  /** This call's version, from 1. */
  version: number
  /** Every version of its story in the chat, in order. */
  versions: StoryImage[]
  /** The story's newest version: the one the chat shows. */
  latest: boolean
}

/**
 * Each story call's version, from the calls in chat order. An edit joins
 * the story of the version it edited, so editing an earlier version still
 * counts on from the latest.
 */
export function storyVersions(
  parts: Iterable<{
    callId: string
    name: string
    input?: unknown
    output?: unknown
  }>
) {
  const stories = new Map<string, StoryImage[]>()
  const found: Record<string, StoryVersions> = {}
  for (const part of parts) {
    const image = madeStory(part.output)
    if (!image) continue
    const source =
      part.name === "edit_story" && part.input && typeof part.input === "object"
        ? (part.input as { image?: unknown }).image
        : undefined
    const versions = (typeof source === "string" && stories.get(source)) || []
    versions.push(image)
    stories.set(image.path, versions)
    found[part.callId] = { version: versions.length, versions, latest: false }
  }
  // Only known once every call is counted.
  for (const item of Object.values(found))
    item.latest = item.version === item.versions.length
  return found
}

/** What Continue sends to go on with an earlier version. */
export const storyVersionText = (version: number, image: StoryImage) =>
  `Continue with version ${version}.\n${STORY_VERSION_LINE}: ${JSON.stringify({
    path: image.path,
    width: image.width,
    height: image.height,
  })}`

/**
 * The version a review answer continues with: a story frame in the chat's
 * private uploads, or null for anything else.
 */
export function readStoryVersion(text: string | undefined): StoryImage | null {
  const match = text?.match(/^Story version: (.+)$/m)
  if (!match || match[1].length > 1000) return null
  try {
    const { path, width, height } = JSON.parse(match[1]) ?? {}
    return typeof path === "string" &&
      isPrivateUpload(path) &&
      path.endsWith(".jpg") &&
      width === STORY_FRAME.width &&
      height === STORY_FRAME.height
      ? { path, width, height }
      : null
  } catch {
    return null
  }
}
