"use server"

import sharp from "sharp"
import { getAdmin } from "@/lib/admin/auth"
import {
  CHAT_BUCKET,
  PRIVATE_CACHE_SECONDS,
  UUID,
  discardStagedMedia,
  isPrivateUpload,
  mediaSessionEvent,
  pinMedia,
  registerChatImage,
} from "@/lib/admin/media-lifecycle"
import { photoEditRequest, storyEditInput } from "@/lib/admin/story-edits"
import { requestStoryImages, type StoryImage } from "@/lib/admin/story-images"
import { sessionSupabase } from "@/lib/supabase/server"

type ImageEditResult =
  | { image: StoryImage; cost: number | null }
  | { problem: string; cost?: number | null }

/** An explicit Apply edits click calls the image model directly. */
export async function applyImageEdit(input: unknown): Promise<ImageEditResult> {
  let cost: number | null | undefined
  try {
    if (!(await getAdmin())) return { problem: "Sign in again to edit images." }
    const parsed = storyEditInput.safeParse(input)
    if (
      !parsed.success ||
      !isPrivateUpload(parsed.data.image) ||
      parsed.data.photos.length
    )
      return { problem: "Upload an image and describe the edits you want." }

    const image = parsed.data.image
    const session = image.split("/")[2]
    if (!UUID.test(session)) return { problem: "Upload the image again." }
    const key = process.env.OPENROUTER_API_KEY
    if (!key) return { problem: "The image editing service is not configured." }

    const supabase = await sessionSupabase()
    await pinMedia(supabase, image)
    const storage = supabase.storage.from(CHAT_BUCKET)
    const { data, error } = await storage.download(image)
    if (error || !data || data.size > 30 * 1024 * 1024)
      return { problem: "Couldn't read this image. Upload it again." }
    await mediaSessionEvent(supabase, session, null, "draft")
    const format = image.endsWith(".webp") ? "webp" : "jpeg"
    const source = `data:image/${format};base64,${Buffer.from(await data.arrayBuffer()).toString("base64")}`

    const result = await requestStoryImages(
      photoEditRequest(parsed.data, source),
      key
    )
    if ("problem" in result) return { problem: result.problem, cost: null }
    cost = result.cost
    const edited = await sharp(result.images[0].bytes)
      .rotate()
      .toColourspace("srgb")
      .jpeg({ quality: 92 })
      .toBuffer({ resolveWithObject: true })
    const path = await registerChatImage(supabase, session, "jpg")
    const saved = await storage.upload(path, edited.data, {
      cacheControl: PRIVATE_CACHE_SECONDS,
      contentType: "image/jpeg",
      upsert: false,
    })
    if (saved.error) {
      await discardStagedMedia(supabase, path).catch(() => {})
      return { problem: "Couldn't save the edited image. Try again.", cost }
    }
    return {
      image: { path, width: edited.info.width, height: edited.info.height },
      cost,
    }
  } catch {
    return {
      problem: "Couldn't finish the image edit. Try again when ready.",
      cost,
    }
  }
}
