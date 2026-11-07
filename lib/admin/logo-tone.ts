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
