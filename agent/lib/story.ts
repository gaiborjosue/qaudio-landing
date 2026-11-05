import { mediaUrl } from "../../lib/media"
import { UPLOADS } from "../../lib/admin/schemas"
import {
  imageSize,
  STORY_FRAME,
  storyNeedsBackground,
  requestStoryImages,
  storyPhotos,
  storyRequest,
  type StoryImage,
  type StoryInput,
} from "../../lib/admin/story-images"
import { BRAND_LOGO_PNG } from "./brand-logo"
import { fitStoryFrame } from "./story-frame"
import {
  storyEditInput,
  storyEditRequest,
  storyBackgroundRequest,
  type StoryEditInput,
} from "../../lib/admin/story-edits"
import {
  ACCESS_TOKEN_ATTRIBUTE,
  verifyAdminToken,
  callerSupabase,
  type CallerContext,
} from "./supabase"

/**
 * Makes the story design, fits it to Instagram's 1080 × 1920 frame, and
 * stages it in media/uploads/ as the admin (RLS), like photos pasted in
 * the chat: the Instagram save copies it into instagram/.
 * Never throws; a failure is a `problem` for the owner, so the workflow
 * step running it never repeats a paid request.
 */
export async function designStory(
  input: StoryInput,
  ctx: CallerContext
): Promise<
  { images: StoryImage[]; cost: number | null } | { problem: string }
> {
  const photos = storyPhotos(input.photos)
  return runStory(ctx, () =>
    storyRequest({ ...input, photos }, BRAND_LOGO_PNG, mediaUrl)
  )
}

/** Edits always send the selected current image first, never GPT Image. */
export async function editStory(input: StoryEditInput, ctx: CallerContext) {
  const parsed = storyEditInput.safeParse(input)
  if (!parsed.success)
    return { problem: "Choose a story image and describe valid edits." }
  return runStory(ctx, async (supabase) => {
    const { data, error } = await supabase.storage
      .from("media")
      .download(parsed.data.image)
    if (error || !data || data.size > 30 * 1024 * 1024)
      throw new Error("source unavailable")
    const bytes = new Uint8Array(await data.arrayBuffer())
    // The frame is authoritative, not client-supplied dimensions.
    const size = imageSize(bytes)
    if (
      size?.width !== STORY_FRAME.width ||
      size.height !== STORY_FRAME.height ||
      bytes[0] !== 0xff ||
      bytes[1] !== 0xd8
    )
      throw new Error("not a story frame")
    const source = `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`
    return storyEditRequest(parsed.data, source, mediaUrl)
  })
}

type StoryResult =
  { images: StoryImage[]; cost: number | null } | { problem: string }

/** Auth precedes paid work; catch every step error so paid calls never retry. */
async function runStory(
  ctx: CallerContext,
  request: (
    supabase: ReturnType<typeof callerSupabase>
  ) =>
    | ReturnType<typeof storyRequest>
    | ReturnType<typeof storyEditRequest>
    | Promise<ReturnType<typeof storyEditRequest>>
): Promise<StoryResult> {
  try {
    const caller = ctx.session.auth.current
    const token = caller?.attributes[ACCESS_TOKEN_ATTRIBUTE]
    if (caller?.principalType !== "user" || typeof token !== "string")
      return { problem: "Sign in as an admin before making story images." }
    const admin = await verifyAdminToken(token)
    if (admin === "invalid" || admin === "forbidden")
      return {
        problem: "The admin session is unavailable; sign in again and retry.",
      }
    return await makeStory(callerSupabase(ctx), request, ctx)
  } catch {
    return {
      problem:
        "Couldn't finish the story image. The request won't be repeated automatically; try again when ready.",
    }
  }
}

async function makeStory(
  supabase: ReturnType<typeof callerSupabase>,
  request: Parameters<typeof runStory>[1],
  ctx: CallerContext
): Promise<StoryResult> {
  let body
  try {
    body = await request(supabase)
  } catch {
    return {
      problem:
        "Couldn't read that story image. Use a generated 1080 × 1920 story from this chat.",
    }
  }
  const result = await requestStoryImages(body, process.env.OPENROUTER_API_KEY)
  if ("problem" in result) return result
  const images: StoryImage[] = []
  let cost = result.cost
  for (let image of result.images.slice(0, 1)) {
    if (storyNeedsBackground(image.width, image.height)) {
      // One bounded Klein edit completes a wrong-aspect result. Never loop
      // or resubmit the GPT generation if extension fails or times out.
      const extended = await requestStoryImages(
        storyBackgroundRequest(image),
        process.env.OPENROUTER_API_KEY
      )
      if ("problem" in extended)
        return {
          problem: `Couldn't extend the story background. ${extended.problem}`,
        }
      const complete = extended.images[0]
      if (storyNeedsBackground(complete.width, complete.height))
        return {
          problem:
            "The image service couldn't complete a full-screen story. No automatic retry was made.",
        }
      cost =
        cost === null || extended.cost === null ? null : cost + extended.cost
      image = complete
    }
    // Instagram's own 1080 × 1920 frame, whatever size came back.
    let fitted
    try {
      fitted = await fitStoryFrame(image.bytes)
    } catch {
      continue
    }
    const path = `${UPLOADS}${crypto.randomUUID()}.jpg`
    const { error } = await supabase.storage
      .from("media")
      .upload(path, fitted.bytes, {
        contentType: "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      })
    if (error) {
      // Keep what landed from piling up: these were never shown.
      if (images.length > 0)
        await discardStory(
          images.map((item) => item.path),
          ctx
        )
      return {
        problem: /jwt|token/i.test(error.message)
          ? "The admin session expired; send any message and try again."
          : "Couldn't save the designs to the media library; try again.",
      }
    }
    images.push({ path, width: fitted.width, height: fitted.height })
  }
  if (images.length === 0) {
    return {
      problem:
        "The image service sent back designs Tune couldn't read; try again.",
    }
  }
  return { images, cost }
}

/** Deletes staged designs nothing will show; only uploads/ files. */
export async function discardStory(
  paths: readonly string[],
  ctx: CallerContext
) {
  const staged = paths.filter((path) => path.startsWith(UPLOADS))
  if (staged.length === 0) return
  try {
    await callerSupabase(ctx).storage.from("media").remove(staged)
  } catch {
    // Left in uploads/, like other photos nothing used.
  }
}
