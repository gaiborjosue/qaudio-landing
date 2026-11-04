import type { EveMessage } from "eve/client"
import { mediaUrl } from "../media"

const UPLOADED_PHOTO =
  /^Photo uploaded: (uploads\/[0-9a-f-]+\.(?:webp|jpg)) \(\d+×\d+\)$/

/**
 * Eve's optimistic message flattens files into trailing `[file: name]` lines.
 * Restore the composer's uploaded photos before delivery.consumed supplies
 * the real file parts. Only remove the exact generated suffix, keeping any
 * file-like text the owner actually typed.
 */
export function withUploadedPhotos(message: EveMessage): EveMessage {
  if (
    message.role !== "user" ||
    !message.metadata?.optimistic ||
    message.parts.some((part) => part.type === "file")
  )
    return message

  return {
    ...message,
    parts: message.parts.flatMap((part): EveMessage["parts"] => {
      if (part.type !== "text") return [part]
      const lines = part.text.split(/\r?\n/)
      const paths = lines.flatMap((line) => {
        const path = line.match(UPLOADED_PHOTO)?.[1]
        return path ? [path] : []
      })
      const suffixAt = lines.length - paths.length
      if (
        paths.length === 0 ||
        !paths.every(
          (path, index) =>
            lines[suffixAt + index] === `[file: ${path.split("/").pop()}]`
        )
      )
        return [part]

      return [
        { ...part, text: lines.slice(0, suffixAt).join("\n") },
        ...paths.map((path) => ({
          type: "file" as const,
          url: mediaUrl(path),
          filename: path.split("/").pop(),
          mediaType: path.endsWith(".webp") ? "image/webp" : "image/jpeg",
        })),
      ]
    }),
  }
}
