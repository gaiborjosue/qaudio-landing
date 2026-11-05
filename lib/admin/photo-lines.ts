// The admin chat's photos travel as lines in the owner's message, never as
// eve attachments: `Photo uploaded: uploads/<uuid>.webp (1600×1200)`. The
// chat hides the lines and shows the photos above the bubble; the agent
// looks at a photo with view_photos, which hands the model its public URL.
// Pure, so the chat, the eve channel, and the agent's tool share it.
// Relative imports, because the agent imports this too.

export type PhotoLine = { path: string; width: number; height: number }

const LINE =
  /^Photo uploaded: (uploads\/[0-9a-f-]+\.(?:webp|jpg)) \((\d+)×(\d+)\)$/gm

/** The line a photo the owner attached rides on. */
export const photoLine = ({ path, width, height }: PhotoLine) =>
  `Photo uploaded: ${path} (${width}×${height})`

/** The photos a message's text carries, in order. */
export function photoLines(text: string): PhotoLine[] {
  return [...text.matchAll(LINE)].map((match) => ({
    path: match[1],
    width: Number(match[2]),
    height: Number(match[3]),
  }))
}

/** Media folders whose photos view_photos opens. */
export const VIEWABLE_FOLDERS = [
  "uploads/",
  "products/",
  "news/",
  "instagram/",
] as const

/** A media path view_photos opens: a known folder, no "..", a photo. */
export function isViewablePath(path: string) {
  return (
    path.length <= 300 &&
    /^[\w.-]+(\/[\w.-]+)+$/.test(path) &&
    !path.split("/").includes("..") &&
    VIEWABLE_FOLDERS.some((folder) => path.startsWith(folder)) &&
    /\.(webp|jpe?g|png|gif)$/i.test(path)
  )
}

/** What the model reads each turn about the photos attached to it. */
export function photoContext(photos: readonly PhotoLine[]) {
  if (photos.length === 0) return null
  const paths = photos.map((photo) => photo.path).join(", ")
  return `The owner attached ${photos.length === 1 ? "a photo" : `${photos.length} photos`} to this message: ${paths}. You can't see ${photos.length === 1 ? "it" : "them"} yet: call view_photos with ${photos.length === 1 ? "that path" : "those paths"} before you describe, judge, or use ${photos.length === 1 ? "it" : "them"}.`
}
