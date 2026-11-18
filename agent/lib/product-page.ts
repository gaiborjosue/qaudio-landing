import {
  extractJsonMiddleware,
  generateText,
  Output,
  wrapLanguageModel,
} from "ai"
import {
  FAST_MODEL_ID,
  validCost,
  type ModelCost,
} from "../../lib/admin/model-cost"
import {
  CHAT_BUCKET,
  PRIVATE_CACHE_SECONDS,
  attachChatImages,
  discardStagedMedia,
  registerChatImage,
} from "../../lib/admin/media-lifecycle"
import {
  compactPage,
  extractPage,
  importPhoto,
  PREFILL_PHOTOS_MAX,
  PREFILL_SYSTEM,
  PrefillProblem,
  prefillDraftSchema,
  prefillPrompt,
  PRODUCT_PHOTOS_MAX,
  suggestionsFromDraft,
  tavilyHumanId,
} from "../../lib/admin/product-page"
import type { EditorPhoto } from "../../lib/admin/product-editor"
import { publicUrl } from "../../lib/admin/public-fetch"
import { sessionMedia } from "./media-session"
import { fastModel } from "./models"
import {
  ACCESS_TOKEN_ATTRIBUTE,
  callerSupabase,
  verifyAdminToken,
  type CallerContext,
} from "./supabase"

// Prefill with Tune for the agent: the product form's manufacturer page
// reader (lib/admin/product-page.ts), with the photos staged in the chat's
// private uploads like the owner's own. Suggestions only; the agent proposes
// them with products__create_product or products__update_products.

/** Tavily's credits have no USD receipt. */
const PAGE_READ = "Tavily page read"

const model = wrapLanguageModel({
  model: fastModel,
  middleware: extractJsonMiddleware(),
})

export type PageSuggestions = {
  name?: string
  brand_slug?: string
  category_slug?: string
  msrp_cents?: number
  price_unit?: "each" | "pair"
  description?: string
  short_description?: string
}

export type PageReading =
  | {
      page: string
      suggestions: PageSuggestions
      photos: EditorPhoto[]
      usage: ModelCost[]
    }
  | { problem: string; usage?: ModelCost[] }

/**
 * Reads a manufacturer's product page and suggests a product's fields and
 * up to 5 photos (fewer when it keeps `photosKept` of its 20). Paid: the admin is
 * verified first, and it never throws, so nothing repeats the paid work.
 */
export async function readManufacturerPage(
  address: string,
  photosKept: number,
  ctx: CallerContext & { abortSignal?: AbortSignal }
): Promise<PageReading> {
  const usage: ModelCost[] = []
  const staged: string[] = []
  const signal = AbortSignal.any([
    AbortSignal.timeout(100_000),
    ...(ctx.abortSignal ? [ctx.abortSignal] : []),
  ])
  try {
    const caller = ctx.session.auth.current
    const token = caller?.attributes[ACCESS_TOKEN_ATTRIBUTE]
    if (caller?.principalType !== "user" || typeof token !== "string")
      return { problem: "Sign in as an admin to read product pages." }
    const admin = await verifyAdminToken(token)
    if (admin === "invalid" || admin === "forbidden")
      return {
        problem: "The admin session is unavailable; sign in again and retry.",
      }
    const apiKey = process.env.TAVILY_API_KEY?.trim()
    if (!apiKey) return { problem: "Reading product pages isn’t set up yet." }
    const url = publicUrl(address)
    if (!url) return { problem: "Use the page’s public https:// address." }
    const slots = Math.max(
      0,
      Math.min(PREFILL_PHOTOS_MAX, PRODUCT_PHOTOS_MAX - photosKept)
    )
    const supabase = callerSupabase(ctx)

    usage.push({ model: PAGE_READ, costUsd: null })
    const page = await extractPage(url, {
      apiKey,
      signal,
      humanId: tavilyHumanId(admin.userId),
    })
    const { text, candidates } = compactPage(page.markdown, page.images, url)
    if (text.length < 80)
      return { problem: "There’s too little on this page to go on.", usage }

    const [categories, brands] = await Promise.all([
      supabase.from("catalog_categories").select("slug, name"),
      supabase.from("catalog_brands").select("slug, name"),
    ])
    if (categories.error || brands.error)
      return {
        problem: "Couldn’t read the shop’s categories and brands.",
        usage,
      }
    const taxonomy = { categories: categories.data, brands: brands.data }

    const drafted = usage.push({ model: FAST_MODEL_ID, costUsd: null }) - 1
    const result = await generateText({
      model,
      system: PREFILL_SYSTEM,
      prompt: prefillPrompt({ url, text, candidates, taxonomy, slots }),
      output: Output.object({ schema: prefillDraftSchema }),
      maxOutputTokens: 4000,
      abortSignal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
    })
    const receipt = result.providerMetadata?.openrouter?.usage
    const cost =
      receipt && typeof receipt === "object" && !Array.isArray(receipt)
        ? (receipt as { cost?: unknown }).cost
        : undefined
    if (validCost(cost))
      usage[drafted] = { model: FAST_MODEL_ID, costUsd: cost }
    const draft = prefillDraftSchema.safeParse(result.output)
    if (!draft.success)
      return { problem: "Tune couldn’t read this page. Try again.", usage }
    const { fields, photos } = suggestionsFromDraft(draft.data, {
      taxonomy,
      candidates,
      slots,
    })

    const session = photos.length > 0 ? await sessionMedia(ctx) : null
    const imported = session
      ? await Promise.all(
          photos.map((photo) =>
            importPhoto(photo, {
              page: url,
              signal,
              store: {
                path: async () => {
                  const path = await registerChatImage(
                    supabase,
                    session,
                    "webp"
                  )
                  staged.push(path)
                  return path
                },
                async upload(path, data) {
                  const { error } = await supabase.storage
                    .from(CHAT_BUCKET)
                    .upload(path, data, {
                      contentType: "image/webp",
                      cacheControl: PRIVATE_CACHE_SECONDS,
                      upsert: false,
                    })
                  if (error) throw new Error("Upload failed.")
                },
                async discard() {},
              },
            })
          )
        )
      : []
    const kept = imported.filter((photo) => photo !== null)
    if (session && kept.length > 0)
      await attachChatImages(
        supabase,
        session,
        kept.map((photo) => photo.path)
      )
    // Registered paths whose download failed hold nothing anyone will use.
    await discard(
      staged.filter((path) => !kept.some((photo) => photo.path === path)),
      ctx
    )

    const { msrp, ...rest } = fields
    const suggestions: PageSuggestions = {
      ...rest,
      ...(msrp && { msrp_cents: Math.round(Number(msrp) * 100) }),
    }
    if (Object.keys(suggestions).length === 0 && kept.length === 0)
      return {
        problem: draft.data.product_page
          ? "Tune found nothing to fill in on this page."
          : "This doesn’t look like a product page.",
        usage,
      }
    return { page: url.href, suggestions, photos: kept, usage }
  } catch (error) {
    await discard(staged, ctx)
    return {
      problem:
        error instanceof PrefillProblem
          ? error.message
          : signal.aborted
            ? "Reading the page took too long. It won’t be repeated automatically; try again when ready."
            : "Couldn’t read this page. It won’t be repeated automatically; try again when ready.",
      ...(usage.length > 0 && { usage }),
    }
  }
}

async function discard(paths: string[], ctx: CallerContext) {
  for (const path of paths) {
    try {
      await discardStagedMedia(callerSupabase(ctx), path)
    } catch {
      // Left in uploads/, like other photos nothing used.
    }
  }
}
