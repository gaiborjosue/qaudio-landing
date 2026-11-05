import type { EveMessage } from "eve/client"
import { mediaUrl } from "../media"
import { photoLines } from "./photo-lines"

/**
 * The photos above one of the owner's bubbles: the ones its `Photo
 * uploaded:` lines name (lib/admin/photo-lines.ts), the same from the first
 * optimistic message on. Older chats sent photos as eve attachments, and
 * show those file parts instead.
 */
export function sentPhotos(message: EveMessage): string[] {
  const files = message.parts.flatMap((part) =>
    part.type === "file" && part.url && part.mediaType.startsWith("image/")
      ? [part.url]
      : []
  )
  if (files.length > 0) return files
  return message.parts.flatMap((part) =>
    part.type === "text"
      ? photoLines(part.text).map((photo) => mediaUrl(photo.path))
      : []
  )
}
