import {
  METADATA_IMAGE_MAX,
  METADATA_SOURCE_MAX,
  type MetadataImageKind,
} from "./metadata"

import { logoTone, type LogoTone } from "./logo-tone"
export { logoTone, type LogoTone } from "./logo-tone"

/**
 * Shrinks artwork in the browser so the admin upload stays below host
 * limits. A logo also comes back with its tone, read from the same pixels.
 */
export async function prepareMetadataImage(
  file: File,
  kind: MetadataImageKind
): Promise<{ blob: Blob; tone: LogoTone | null }> {
  if (!/^image\/(png|jpeg|webp|avif)$/.test(file.type))
    throw new Error("Use a PNG, JPEG, WebP, or AVIF image.")
  if (file.size > METADATA_SOURCE_MAX)
    throw new Error("Use an image under 20 MB.")
  const bitmap = await createImageBitmap(file)
  try {
    if (bitmap.width * bitmap.height > 32_000_000)
      throw new Error("Use an image under 32 megapixels.")
    const edge = kind === "scene" ? 1600 : 1024
    const ratio = Math.min(1, edge / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio))
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Couldn’t read the image.")
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const tone =
      kind === "logo"
        ? logoTone(
            context.getImageData(0, 0, canvas.width, canvas.height).data,
            canvas.width,
            canvas.height
          )
        : null
    // PNG retains transparency and sharp edges; photos use WebP (PNG fallback).
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(
        resolve,
        kind === "scene" ? "image/webp" : "image/png",
        0.88
      )
    )
    if (!blob || blob.size > METADATA_IMAGE_MAX)
      throw new Error(
        "This image is too detailed to upload. Choose a smaller image."
      )
    return { blob, tone }
  } finally {
    bitmap.close()
  }
}
