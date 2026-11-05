import sharp from "sharp"
import { STORY_FRAME, storyNeedsBackground } from "../../lib/admin/story-images"

// Normalize only a full-bleed story. A different aspect ratio must first
// have its background extended with Klein in story.ts; never add flat bands
// or crop away foreground content to force the frame.
const { width: W, height: H } = STORY_FRAME

export type FittedStory = { bytes: Buffer; width: number; height: number }

/** A full-bleed 1080 × 1920 sRGB JPEG, with at most a 2% framing adjustment. */
export async function fitStoryFrame(input: Uint8Array): Promise<FittedStory> {
  const source = await sharp(input, { failOn: "error", autoOrient: true })
    .toColourspace("srgb")
    .toBuffer({ resolveWithObject: true })
  if (storyNeedsBackground(source.info.width, source.info.height))
    throw new Error(
      "This design needs its background extended to the story frame."
    )
  const bytes = await sharp(source.data)
    .resize(W, H, { fit: "cover", position: "centre" })
    .flatten({ background: "#000000" })
    .jpeg({ quality: 90, mozjpeg: true, progressive: true })
    .toBuffer()
  return { bytes, width: W, height: H }
}
