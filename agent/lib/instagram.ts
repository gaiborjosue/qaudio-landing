import { createHash } from "node:crypto"
import sharp from "sharp"
import type { InstagramFrame } from "../../lib/admin/instagram"
import {
  InstagramError,
  uploadInstagramPhoto,
} from "../../lib/admin/instagram-posts"
import { readZernioConfig, type ZernioConfig } from "../../lib/admin/zernio-api"
import { mediaUrl } from "../../lib/media"
import {
  ACCESS_TOKEN_ATTRIBUTE,
  verifyAdminToken,
  type CallerContext,
} from "./supabase"

// Instagram tools call Zernio with the server's key, not through Supabase,
// so RLS can't stand in for the admin check: every tool checks the caller
// here first. The profile comes only from the server's configuration.

/** Zernio settings, once the caller is confirmed as a signed-in site admin. */
export async function instagramAccess(ctx: CallerContext) {
  const caller = ctx.session.auth.current
  const token = caller?.attributes[ACCESS_TOKEN_ATTRIBUTE]
  if (caller?.principalType !== "user" || typeof token !== "string") {
    throw new Error(
      "No signed-in admin on this request. Ask the owner to sign in at /admin and send the request from there."
    )
  }
  const admin = await verifyAdminToken(token)
  if (admin === "invalid") {
    throw new Error(
      "Instagram: the admin session expired. Ask the owner to send any message (the page refreshes the session), then try again."
    )
  }
  if (admin === "forbidden") {
    throw new Error("Instagram: only site admins can do this.")
  }
  const config = readZernioConfig()
  if (!config) {
    throw new Error(
      "Instagram isn't set up on this site yet (the Zernio settings are missing)."
    )
  }
  return config
}

/** Same call, same key: a replayed call returns the post it made. */
export function idempotencyKey(ctx: {
  session: { id: string }
  callId: string
}) {
  const digest = createHash("sha256")
    .update(`${ctx.session.id}:${ctx.callId}`)
    .digest("hex")
  return `tune-${digest.slice(0, 48)}`
}

const SOURCE_MAX_BYTES = 30 * 1024 * 1024

/** A media-bucket photo, read through its public address. */
async function sourcePhoto(path: string) {
  let response: Response
  try {
    response = await fetch(mediaUrl(path), {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    throw new InstagramError(`Couldn't read the photo ${path}. Try again.`)
  }
  if (!response.ok) {
    throw new InstagramError(
      response.status === 404 || response.status === 400
        ? `There's no photo at ${path}.`
        : `Couldn't read the photo ${path}. Try again.`
    )
  }
  const length = Number(response.headers.get("content-length") ?? 0)
  if (
    !response.headers.get("content-type")?.startsWith("image/") ||
    length > SOURCE_MAX_BYTES
  ) {
    throw new InstagramError(`${path} isn't a photo Tune can post.`)
  }
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > SOURCE_MAX_BYTES) {
    throw new InstagramError(`${path} is too large to post.`)
  }
  return bytes
}

type Photo = { path: string; width: number; height: number }

/**
 * The photo as Instagram gets it: upright, fitted to the post's frame (the
 * same crop or bars the approval card showed), sRGB JPEG, no metadata.
 */
export async function instagramJpeg(photo: Photo, frame: InstagramFrame) {
  const image = sharp(await sourcePhoto(photo.path), {
    autoOrient: true,
    failOn: "error",
    limitInputPixels: 100_000_000,
  })
  let size: { width: number; height: number }
  try {
    size = (await image.metadata()).autoOrient
  } catch {
    throw new InstagramError(`${photo.path} isn't a photo Tune can read.`)
  }
  // The preview was drawn from the stated size; refuse to post another crop.
  const stated = photo.width / photo.height
  if (Math.abs(size.width / size.height / stated - 1) > 0.03) {
    throw new InstagramError(
      `${photo.path} is ${size.width}×${size.height}, not ${photo.width}×${photo.height}. Send its real size so the preview matches.`
    )
  }
  return image
    .resize(frame.width, frame.height, {
      fit: frame.fit,
      position: "centre",
      background: frame.background,
    })
    .flatten({ background: frame.background })
    .toColourspace("srgb")
    .jpeg({ quality: 88, mozjpeg: true, progressive: true })
    .toBuffer()
}

/** Converts and uploads each photo to Zernio, in order. */
export async function uploadInstagramPhotos(
  config: ZernioConfig,
  photos: Photo[],
  frame: InstagramFrame
) {
  const urls: string[] = []
  // One at a time: a carousel is at most ten, and it spares the rate limit.
  for (const photo of photos) {
    const jpeg = await instagramJpeg(photo, frame)
    const name = `tune-${createHash("sha256").update(jpeg).digest("hex").slice(0, 24)}`
    urls.push(await uploadInstagramPhoto(config, jpeg, name))
  }
  return urls
}
