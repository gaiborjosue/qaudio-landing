import sharp from "sharp"
import {
  checkGoogleBusinessPostingTarget,
  GoogleBusinessError,
} from "../../lib/admin/google-business-api"
import { GOOGLE_BUSINESS_IMAGE } from "../../lib/admin/google-business-types"
import type { ModelCost } from "../../lib/admin/model-cost"
import type { GoogleBusinessTarget } from "../../lib/admin/schemas"
import {
  requestStoryImages,
  STORY_MODEL,
  STORY_OPTIONS,
  storyPhotos,
  type StoryImage,
} from "../../lib/admin/story-images"
import { readableMediaUrl } from "../../lib/admin/media-lifecycle"
import { BRAND_LOGO_PNG } from "./brand-logo"
import { googleBusinessAccess } from "./google-business"
import { stageChatJpeg } from "./media"
import { sessionMedia } from "./media-session"
import { callerSupabase, type CallerContext } from "./supabase"

export function googleOfferImageRequest(
  brief: string,
  photoUrls: readonly string[]
) {
  return {
    ...STORY_OPTIONS,
    model: STORY_MODEL,
    aspect_ratio: "4:3",
    prompt: [
      "Design a single edge-to-edge 1200 × 900 landscape image for a Q Audio Google Business Offer.",
      brief,
      "The first reference is the Q Audio logo. Keep it accurate. The other references are actual products and promotion art. Recompose them for the landscape frame and preserve product shapes, finishes and marks. Use the given products, prices and offer details only.",
      "Use one strong focal point, generous margins and large, high-contrast text. Keep the key artwork and lettering in the central area for thumbnail cropping.",
      "Leave out all phone numbers, email addresses, social handles, street addresses, web addresses, QR codes, Instagram interface elements and contact instructions, even if any appear in reference images or the brief. Put the coupon, redemption link and terms in the native Google Offer fields instead. Use only a short deal headline if the design needs text. Keep typography accurate and easy to read.",
    ].join("\n\n"),
    input_references: [BRAND_LOGO_PNG, ...photoUrls].map((url) => ({
      type: "image_url",
      image_url: { url },
    })),
  }
}

export async function fitGoogleOfferImage(input: Uint8Array) {
  const { width, height } = GOOGLE_BUSINESS_IMAGE
  const image = sharp(input, { failOn: "error", autoOrient: true })
  const { autoOrient } = await image.metadata()
  if (
    Math.abs(autoOrient.width / autoOrient.height / (width / height) - 1) > 0.15
  )
    throw new Error("The image service did not return a landscape design.")
  return image
    .resize(width, height, { fit: "cover", position: "centre" })
    .flatten({ background: "#ffffff" })
    .toColourspace("srgb")
    .jpeg({ quality: 90, mozjpeg: true, progressive: true })
    .toBuffer()
}

/** Check the destination and admin before spending. Never retry a paid call. */
export async function designGoogleOfferImage(
  input: { target: GoogleBusinessTarget; brief: string; photos: string[] },
  ctx: CallerContext
): Promise<
  | { design: StoryImage; usage: ModelCost[] }
  | { problem: string; usage: ModelCost[] }
> {
  const usage: ModelCost[] = []
  try {
    const config = await googleBusinessAccess(ctx)
    await checkGoogleBusinessPostingTarget(config, input.target)
    const supabase = callerSupabase(ctx)
    const photos = await Promise.all(
      storyPhotos(input.photos).map((path) => readableMediaUrl(supabase, path))
    )
    const body = googleOfferImageRequest(input.brief, photos)
    const result = await requestStoryImages(
      body,
      process.env.OPENROUTER_API_KEY
    )
    if ("problem" in result)
      return {
        problem: result.problem,
        usage: [{ model: body.model, costUsd: null }],
      }
    usage.push({ model: body.model, costUsd: result.cost })

    const jpeg = await fitGoogleOfferImage(result.images[0].bytes)
    const staged = await stageChatJpeg(supabase, await sessionMedia(ctx), jpeg)
    if ("problem" in staged) return { ...staged, usage }
    return { design: { path: staged.path, ...GOOGLE_BUSINESS_IMAGE }, usage }
  } catch (error) {
    return {
      problem:
        error instanceof GoogleBusinessError
          ? error.message
          : "Couldn't finish the Google Offer image. Check the references before requesting a new attempt.",
      usage,
    }
  }
}
