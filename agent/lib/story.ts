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
import type { ModelCost } from "../../lib/admin/model-cost"
import { fitStoryFrame } from "./story-frame"
import {
  mediaBucket,
  readableMediaUrl,
  discardStagedMedia,
} from "../../lib/admin/media-lifecycle"
import { stageChatJpeg } from "./media"
import { sessionMedia } from "./media-session"
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
 * stages it in private chat-uploads as the admin (RLS), like photos pasted in
 * the chat: the Instagram save copies it into instagram/.
 * Never throws; a failure is a `problem` for the owner, so the workflow
 * step running it never repeats a paid request.
 */
export async function designStory(
  input: StoryInput,
  ctx: CallerContext
): Promise<
  | { images: StoryImage[]; cost: number | null; usage: ModelCost[] }
  | { problem: string; usage?: ModelCost[] }
> {
  const photos = storyPhotos(input.photos)
  return runStory(ctx, async (supabase) => {
    const urls = new Map(
      await Promise.all(
        photos.map(
          async (path) =>
            [path, await readableMediaUrl(supabase, path)] as const
        )
      )
    )
    return storyRequest({ ...input, photos }, BRAND_LOGO_PNG, (path) =>
      urls.get(path)!
    )
  })
}

/** Edits always send the selected current image first, never GPT Image. */
export async function editStory(input: StoryEditInput, ctx: CallerContext) {
  const parsed = storyEditInput.safeParse(input)
  if (!parsed.success)
    return { problem: "Choose a story image and describe valid edits." }
  return runStory(ctx, async (supabase) => {
    const { data, error } = await supabase.storage
      .from(mediaBucket(parsed.data.image))
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
    const urls = new Map(
      await Promise.all(
        parsed.data.photos.map(
          async (path) =>
            [path, await readableMediaUrl(supabase, path)] as const
        )
      )
    )
    return storyEditRequest(parsed.data, source, (path) => urls.get(path)!)
  })
}

type StoryResult =
  | { images: StoryImage[]; cost: number | null; usage: ModelCost[] }
  | { problem: string; usage?: ModelCost[] }

/** Auth precedes paid work; catch every step error so paid calls never retry. */
async function runStory(
  ctx: CallerContext,
  request: (
    supabase: ReturnType<typeof callerSupabase>
  ) =>
    | ReturnType<typeof storyRequest>
    | ReturnType<typeof storyEditRequest>
    | Promise<
        ReturnType<typeof storyRequest> | ReturnType<typeof storyEditRequest>
      >
): Promise<StoryResult> {
  const usage: ModelCost[] = []
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
    return await makeStory(callerSupabase(ctx), request, ctx, usage)
  } catch {
    return {
      problem:
        "Couldn't finish the story image. The request won't be repeated automatically; try again when ready.",
      usage,
    }
  }
}

async function makeStory(
  supabase: ReturnType<typeof callerSupabase>,
  request: Parameters<typeof runStory>[1],
  ctx: CallerContext,
  usage: ModelCost[]
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
  if ("problem" in result)
    return { ...result, usage: [{ model: body.model, costUsd: null }] }
  usage.push({ model: body.model, costUsd: result.cost })
  const images: StoryImage[] = []
  let cost = result.cost
  for (let image of result.images.slice(0, 1)) {
    if (storyNeedsBackground(image.width, image.height)) {
      // One bounded Klein edit completes a wrong-aspect result. Never loop
      // or resubmit the GPT generation if extension fails or times out.
      const extension = storyBackgroundRequest(image)
      const extended = await requestStoryImages(
        extension,
        process.env.OPENROUTER_API_KEY
      )
      if ("problem" in extended)
        return {
          problem: `Couldn't extend the story background. ${extended.problem}`,
          usage: [...usage, { model: extension.model, costUsd: null }],
        }
      usage.push({ model: extension.model, costUsd: extended.cost })
      const complete = extended.images[0]
      if (storyNeedsBackground(complete.width, complete.height))
        return {
          problem:
            "The image service couldn't complete a full-screen story. No automatic retry was made.",
          usage,
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
    const staged = await stageChatJpeg(
      supabase,
      await sessionMedia(ctx),
      fitted.bytes
    )
    if ("problem" in staged) return { problem: staged.problem, usage }
    images.push({
      path: staged.path,
      width: fitted.width,
      height: fitted.height,
    })
  }
  if (images.length === 0) {
    return {
      problem:
        "The image service sent back designs Tune couldn't read; try again.",
      usage,
    }
  }
  return { images, cost, usage }
}

/** Deletes staged designs nothing will show; only uploads/ files. */
export async function discardStory(
  paths: readonly string[],
  ctx: CallerContext
) {
  const staged = paths.filter((path) => path.startsWith(UPLOADS))
  if (staged.length === 0) return
  try {
    for (const path of staged)
      await discardStagedMedia(callerSupabase(ctx), path)
  } catch {
    // Left in uploads/, like other photos nothing used.
  }
}
