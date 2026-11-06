import {
  METADATA_IMAGE_MAX,
  METADATA_SOURCE_MAX,
  type MetadataImageKind,
} from "./metadata"

/**
 * A logo's artwork: light marks (kept as they are) or dark ones, which the
 * upload inverts to the site's light-on-black logo contract.
 */
export type LogoTone = "light" | "dark"

const lightness = (pixels: ArrayLike<number>, at: number) =>
  0.2126 * pixels[at] + 0.7152 * pixels[at + 1] + 0.0722 * pixels[at + 2]

/**
 * Reads a logo's tone from its RGBA pixels, row by row. The edge shows the
 * ground: on a clear ground the marks are the opaque pixels, so their
 * average lightness decides; on a solid ground, dark marks sit on a light
 * one. Pure, so it's tested (scripts/metadata.test.mjs).
 */
export function logoTone(
  pixels: ArrayLike<number>,
  width: number,
  height: number
): LogoTone {
  if (width < 1 || height < 1) return "light"
  let edge = 0
  let clearEdge = 0
  let groundLight = 0
  const visit = (x: number, y: number) => {
    const at = (y * width + x) * 4
    edge++
    if (pixels[at + 3] < 128) clearEdge++
    else groundLight += lightness(pixels, at)
  }
  for (let x = 0; x < width; x++) {
    visit(x, 0)
    if (height > 1) visit(x, height - 1)
  }
  for (let y = 1; y < height - 1; y++) {
    visit(0, y)
    if (width > 1) visit(width - 1, y)
  }
  if (clearEdge * 2 < edge) {
    return groundLight / (edge - clearEdge) > 128 ? "dark" : "light"
  }
  // About 40,000 samples, however large the logo.
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 40_000)))
  let weight = 0
  let marks = 0
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const at = (y * width + x) * 4
      const alpha = pixels[at + 3]
      if (alpha < 128) continue
      weight += alpha
      marks += alpha * lightness(pixels, at)
    }
  }
  return weight > 0 && marks / weight < 128 ? "dark" : "light"
}

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
