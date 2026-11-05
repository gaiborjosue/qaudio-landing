import { isViewablePath } from "./photo-lines"

// Instagram story designs, made by OpenRouter's Image API with GPT Image
// 2.6 Flare: the agent's design_story tool (agent/tools/design_story.ts)
// sends a brief with the shop's logo and the owner's photos as references;
// the design shows in the chat, then on the story's approval card.
// Everything here is pure (the request, the prompt, reading the reply,
// image sizes, the chat's progress estimate), so it's tested in
// scripts/story.test.mjs.
// Relative imports, because the agent imports this too.

export const STORY_MODEL = "openai/gpt-image-2.6-flare"
export const STORY_ENDPOINT = "https://openrouter.ai/api/v1/images"

/**
 * Fixed for every story: Instagram's 9:16 frame, JPEG (the post converts
 * to JPEG anyway, and it's a fraction of PNG's size), high quality, one
 * design (the owner approves it on the story's card, or asks for changes).
 */
export const STORY_OPTIONS = {
  aspect_ratio: "9:16",
  output_format: "jpeg",
  quality: "high",
  background: "auto",
  n: 1,
} as const

export const STORY_BACKGROUND_RULE =
  "The background, scene, photography, textures, and decorative artwork continue seamlessly to all four edges, including behind Instagram's interface. The safe zone is a text-placement guide, not a blank margin or a mask. Never draw separate top or bottom panels, flat padding bands, letterboxing, abrupt horizontal cutoffs, or borders at the safe-zone boundaries."

/** A different frame needs generative background extension, never flat padding. */
export function storyNeedsBackground(width: number, height: number) {
  return (
    Math.abs(width / height / (STORY_FRAME.width / STORY_FRAME.height) - 1) >
    0.02
  )
}

/** Reference photos besides the logo (the API takes 16 in all). */
export const STORY_PHOTOS_MAX = 6
/** How long a design takes, roughly: the chat's progress follows it. */
export const STORY_SECONDS = 35
/** The longest a request may take before it's given up. */
export const STORY_TIMEOUT_MS = 240_000

export const SHOP_ADDRESS = "5 Brookline Street, Cambridge, MA"

/**
 * Instagram's story canvas and the safe zone inside it, in pixels. The top
 * strip holds Instagram's progress bar, profile name, and close button; the
 * bottom one the "Send message" bar, like, and share (and on ads, the call
 * to action). Keeping words and readable logos between them leaves a
 * 1080 × 1330 band nothing covers (Moonb's 2026 story specs: y = 250 to
 * 1580). The side margin keeps lettering off the screen's edge.
 * The scene continues through those strips; they are never blank margins.
 * Every design is fitted to this canvas, extending its background with
 * Klein first if needed, and the chat's large view can show the zone.
 */
export const STORY_FRAME = {
  width: 1080,
  height: 1920,
  top: 250,
  bottom: 340,
  side: 64,
} as const

export type StoryInput = {
  /** What the story says and shows. */
  brief: string
  /** Media paths of the reference photos. */
  photos: string[]
  /** Show the shop's address. */
  address: boolean
}

export type StoryImage = { path: string; width: number; height: number }

const {
  width: W,
  height: H,
  top: TOP,
  bottom: BOTTOM,
  side: SIDE,
} = STORY_FRAME
const percent = (px: number) => Math.round((px / H) * 100)

/** The words the image model gets: the brief inside the brand's rules. */
export function storyPrompt({ brief, photos, address }: StoryInput) {
  return [
    `Design one full-screen Instagram story for Q Audio, an independent hi-fi shop in Cambridge, Massachusetts: a single vertical 9:16 canvas, ${W} × ${H} pixels, composed for that tall frame from edge to edge.`,
    brief.trim(),
    "Brand: the first reference image is the Q Audio logo (a serif Q over the word AUDIO, in a thin frame). Place it in the design exactly as given: the same shape, letters, frame, and proportions, never redrawn, restyled, or misspelled. It may be white on a dark background or black on a light one, and must be clearly visible.",
    photos.length > 0
      ? "The other reference images are the shop's own photos and promotion material. They are source material, not the layout: they can be square, landscape, or any shape, so re-compose everything for the tall 9:16 frame instead of copying their framing. Never crop or enlarge a reference so that its text or logo runs off the canvas or behind Instagram's interface. If the promotion graphic itself appears, show it whole, scaled down to fit inside the safe zone with a margin all round, integrating its background with the surrounding full-bleed scene. Keep every product exactly as the photos show it (shape, finish, logos, and colours); don't invent products, models, or features."
      : "",
    `Safe zone: Instagram draws its own interface over the top ${TOP} pixels (${percent(TOP)}%: progress bar, profile name, close button) and the bottom ${BOTTOM} pixels (${percent(BOTTOM)}%: the "Send message" bar, like, and share). Put every word, number, and readable logo inside the band from ${TOP} to ${H - BOTTOM} pixels down, at least ${SIDE} pixels from the left and right edges, with room to spare. Keep text clear of those overlays; the image and decorative artwork may continue behind them.`,
    STORY_BACKGROUND_RULE,
    address
      ? `Show the shop's address, "${SHOP_ADDRESS}", small at the foot of the safe zone, above the bottom ${BOTTOM} pixels.`
      : "",
    "Text: use only the words given here, spelled exactly; few, short lines, large enough to read on a phone at arm's length, with strong contrast (a calm backing behind any text over a busy image). No prices, dates, or claims beyond those given; no Instagram interface, stickers, QR codes, or watermarks.",
    "Style: premium and calm, like a high-end audio brand's editorial print: one focal point, a clear hierarchy, generous space, real materials and light.",
  ]
    .filter(Boolean)
    .join("\n\n")
}

/** The Image API request: the logo first, then the owner's photos. */
export function storyRequest(
  input: StoryInput,
  logo: string,
  photoUrl: (path: string) => string
) {
  return {
    model: STORY_MODEL,
    prompt: storyPrompt(input),
    ...STORY_OPTIONS,
    input_references: [
      logo,
      ...input.photos.slice(0, STORY_PHOTOS_MAX).map(photoUrl),
    ].map((url) => ({ type: "image_url", image_url: { url } })),
  }
}

/** Reference photos the design may use: media photos only, each once. */
export function storyPhotos(paths: readonly string[]) {
  return [...new Set(paths)].filter(isViewablePath).slice(0, STORY_PHOTOS_MAX)
}

/** An image's width and height from its PNG, JPEG, or WebP header. */
export function imageSize(
  bytes: Uint8Array
): { width: number; height: number } | null {
  const at = (i: number) => bytes[i] ?? 0
  const u16 = (i: number) => (at(i) << 8) | at(i + 1)
  const u32 = (i: number) => ((u16(i) << 16) >>> 0) + u16(i + 2)
  const le16 = (i: number) => at(i) | (at(i + 1) << 8)
  const le24 = (i: number) => at(i) | (at(i + 1) << 8) | (at(i + 2) << 16)
  // PNG: the IHDR chunk follows the 8-byte signature.
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) {
    return { width: u32(16), height: u32(20) }
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (at(0) === 0xff && at(1) === 0xd8) {
    let i = 2
    while (i + 9 < bytes.length) {
      if (at(i) !== 0xff) return null
      const marker = at(i + 1)
      if (
        marker === 0xd8 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        i += 2
        continue
      }
      const length = u16(i + 2)
      const frame =
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      if (frame) return { width: u16(i + 7), height: u16(i + 5) }
      i += 2 + length
    }
    return null
  }
  // WebP: RIFF, then a VP8, VP8L, or VP8X chunk.
  const tag = (i: number) =>
    String.fromCharCode(at(i), at(i + 1), at(i + 2), at(i + 3))
  if (tag(0) === "RIFF" && tag(8) === "WEBP") {
    const chunk = tag(12)
    if (chunk === "VP8X") return { width: le24(24) + 1, height: le24(27) + 1 }
    if (chunk === "VP8 ") {
      return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff }
    }
    if (chunk === "VP8L") {
      const bits = at(21) | (at(22) << 8) | (at(23) << 16) | (at(24) << 24)
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      }
    }
  }
  return null
}

/** A design from the reply, decoded, with its size and file extension. */
export type DecodedImage = {
  bytes: Uint8Array
  mediaType: string
  extension: "jpg" | "png" | "webp"
  width: number
  height: number
}

const EXTENSIONS: Record<string, DecodedImage["extension"]> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

/** The designs in an Image API reply; those that don't decode are left out. */
export function readStoryReply(reply: unknown): {
  images: DecodedImage[]
  cost: number | null
} {
  const body = (reply ?? {}) as {
    data?: { b64_json?: unknown; media_type?: unknown }[]
    usage?: { cost?: unknown }
  }
  const images = (Array.isArray(body.data) ? body.data : []).flatMap((item) => {
    if (typeof item?.b64_json !== "string") return []
    const bytes = Uint8Array.from(Buffer.from(item.b64_json, "base64"))
    const size = imageSize(bytes)
    const mediaType =
      typeof item.media_type === "string" ? item.media_type : "image/jpeg"
    const extension = EXTENSIONS[mediaType.toLowerCase()]
    if (!size || !extension || size.width < 1 || size.height < 1) return []
    return [{ bytes, mediaType, extension, ...size }]
  })
  const cost = typeof body.usage?.cost === "number" ? body.usage.cost : null
  return { images, cost }
}

/** What to tell the owner when the Image API says no; never its own text. */
export function storyProblem(status: number) {
  if (status === 401 || status === 403) {
    return "The image service refused the request: check OPENROUTER_API_KEY and its spend limit."
  }
  if (status === 402)
    return "The OpenRouter account is out of credits for images."
  if (status === 404) return "The image model isn't available right now."
  if (status === 413) return "The reference photos are too large; use fewer."
  if (status === 429) return "The image service is busy; try again in a minute."
  if (status === 400) {
    return "The image service couldn't use that request; change the brief or the photos."
  }
  return "The image service didn't make the design (nothing was charged); try again."
}

/**
 * Asks the Image API for the designs. Never throws: a failure comes back as
 * a `problem` worded for the owner, so nothing retries a paid request.
 */
export async function requestStoryImages(
  body: {
    model: string
    prompt: string
    input_references: { type: string; image_url: { url: string } }[]
  },
  apiKey: string | undefined,
  fetcher: typeof fetch = fetch
): Promise<
  { images: DecodedImage[]; cost: number | null } | { problem: string }
> {
  if (!apiKey) return { problem: "OPENROUTER_API_KEY isn't set for the agent." }
  let response: Response
  try {
    response = await fetcher(STORY_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(STORY_TIMEOUT_MS),
    })
  } catch (error) {
    return {
      problem:
        error instanceof DOMException && error.name === "TimeoutError"
          ? "The image service took too long; try again."
          : "Couldn't reach the image service; try again.",
    }
  }
  if (!response.ok) return { problem: storyProblem(response.status) }
  let reply: unknown
  try {
    reply = await response.json()
  } catch {
    return {
      problem: "The image service sent back something unreadable; try again.",
    }
  }
  const result = readStoryReply(reply)
  if (result.images.length === 0) {
    return { problem: "The image service sent back no design; try again." }
  }
  return result
}

/**
 * The chat's estimate of how far along the design is, 0 to 0.97, from
 * the seconds since they started: quick at first, slowing as it nears the
 * end, never claiming done. The API reports no progress of its own.
 */
export function storyProgress(seconds: number) {
  if (!(seconds > 0)) return 0
  return Math.min(0.97, 1 - Math.exp(-seconds / (STORY_SECONDS / 2.2)))
}
