import sharp from "sharp"
import {
  METADATA_IMAGE_MAX,
  metadataImageKind,
  type MetadataImageKind,
} from "./metadata"

/** Convert uploaded artwork to the site's existing light-on-dark logo contract. */
export async function encodeMetadataImage(
  bytes: Buffer,
  kind: MetadataImageKind,
  darkArtwork: boolean
) {
  const image = sharp(bytes, { limitInputPixels: 32_000_000, animated: false })
  const info = await image.metadata()
  if (
    !info.format ||
    !["png", "jpeg", "webp", "avif"].includes(info.format) ||
    (info.pages ?? 1) > 1
  ) {
    throw new Error("Use a still PNG, JPEG, WebP, or AVIF image.")
  }
  let output = image
    .rotate()
    .resize({
      width: kind === "scene" ? 1600 : 1024,
      height: kind === "scene" ? 1600 : 1024,
      fit: "inside",
      withoutEnlargement: true,
    })
    .toColourspace("srgb")
  if (kind !== "scene") output = output.greyscale()
  if (kind === "logo") {
    if (darkArtwork) output = output.negate({ alpha: false })
    output = output.flatten({ background: "#000000" })
  }
  return output
    .webp(kind === "scene" ? { quality: 86 } : { lossless: true })
    .toBuffer()
}

type ImageDependencies = {
  authorize: () => Promise<boolean>
  store: (bytes: Buffer) => Promise<string>
  remove: (path: string) => Promise<void>
}

/** Bounded raw-image upload, with no multipart parser or upstream payloads. */
export async function metadataImageRoute(
  request: Request,
  deps: ImageDependencies
) {
  const reply = (body: object, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
  if (!(await deps.authorize()))
    return reply({ error: "Sign in as an admin." }, 401)
  const url = new URL(request.url)
  if (request.headers.get("origin") !== url.origin)
    return reply({ error: "Upload images from this site." }, 403)
  const kind = metadataImageKind.safeParse(url.searchParams.get("kind"))
  if (
    !kind.success ||
    !/^image\/(png|jpeg|webp|avif)$/.test(
      request.headers.get("content-type") ?? ""
    )
  ) {
    return reply({ error: "Use a PNG, JPEG, WebP, or AVIF image." }, 400)
  }
  if (Number(request.headers.get("content-length")) > METADATA_IMAGE_MAX)
    return reply({ error: "Use an image under 4 MB." }, 413)
  const reader = request.body?.getReader()
  if (!reader) return reply({ error: "Choose an image." }, 400)
  try {
    const chunks: Uint8Array[] = []
    let size = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > METADATA_IMAGE_MAX) {
        await reader.cancel()
        return reply({ error: "Use an image under 4 MB." }, 413)
      }
      chunks.push(value)
    }
    const bytes = await encodeMetadataImage(
      Buffer.concat(chunks),
      kind.data,
      url.searchParams.get("tone") === "dark"
    )
    if (request.signal.aborted)
      return reply({ error: "Upload cancelled." }, 499)
    const path = await deps.store(bytes)
    if (request.signal.aborted) {
      await deps.remove(path)
      return reply({ error: "Upload cancelled." }, 499)
    }
    return reply({ path })
  } catch {
    return reply(
      {
        error:
          "Couldn’t upload this image. Use a still PNG, JPEG, WebP, or AVIF under 4 MB.",
      },
      400
    )
  } finally {
    reader.releaseLock()
  }
}
