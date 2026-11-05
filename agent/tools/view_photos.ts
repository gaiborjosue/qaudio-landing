import { defineTool, toolOutput, toolOutputPart } from "eve/tools"
import { z } from "zod"
import { isViewablePath } from "../../lib/admin/photo-lines"
import { mediaUrl } from "../../lib/media"

// The model sees a photo by its public URL, which the model provider reads
// itself (toolOutputPart.fileUrl). Nothing is copied into the session
// sandbox, so photos don't depend on one, and none is started for them.
// The media bucket is public, and its uploads/ copies are never deleted
// once sent, so a URL stays readable for the whole chat.

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
])

type Seen =
  | { path: string; url: string; mediaType: string }
  | { path: string; problem: string }

export default defineTool({
  description:
    "Look at photos in the media library by path: the ones the owner attached (their `Photo uploaded:` lines), or a product's, news post's, or Instagram post's saved photos. Call it before you describe, judge, or use a photo, and again to look at one later in the chat.",
  inputSchema: z.object({
    paths: z
      .array(
        z
          .string()
          .refine(
            isViewablePath,
            "A photo path under uploads/, products/, news/, or instagram/."
          )
      )
      .min(1)
      .max(10)
      .describe("Media bucket paths, such as uploads/<file>.webp."),
  }),
  label: {
    start: ({ paths }) =>
      paths.length === 1
        ? "Look at the photo"
        : `Look at ${paths.length} photos`,
  },
  async execute({ paths }) {
    // Each photo is checked first: a URL the provider can't read would fail
    // the whole model call.
    const seen = await Promise.all(
      [...new Set(paths)].map(async (path): Promise<Seen> => {
        const url = mediaUrl(path)
        try {
          const response = await fetch(url, {
            method: "HEAD",
            redirect: "error",
            signal: AbortSignal.timeout(8000),
          })
          const type = response.headers
            .get("content-type")
            ?.split(";")[0]
            .trim()
            .toLowerCase()
          if (response.ok && type && IMAGE_TYPES.has(type)) {
            return { path, url, mediaType: type }
          }
          return {
            path,
            problem: response.ok ? "isn't a photo" : "wasn't found",
          }
        } catch {
          return { path, problem: "couldn't be reached; try again" }
        }
      })
    )
    return {
      photos: seen.filter((item) => "url" in item),
      missing: seen.filter((item) => "problem" in item),
    }
  },
  toModelOutput({ photos, missing }) {
    return toolOutput.content([
      ...photos.flatMap((photo) => [
        toolOutputPart.text(`Photo ${photo.path}:`),
        toolOutputPart.fileUrl(photo.url, {
          mediaType: photo.mediaType,
          filename: photo.path.split("/").pop(),
        }),
      ]),
      ...missing.map((item) =>
        toolOutputPart.text(`${item.path} ${item.problem}.`)
      ),
    ])
  },
})
