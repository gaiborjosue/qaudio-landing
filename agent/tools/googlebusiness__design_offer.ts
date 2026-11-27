import { defineTool } from "eve/tools"
import { z } from "zod"
import { isViewablePath } from "../../lib/admin/photo-lines"
import { googleBusinessTargetSchema } from "../../lib/admin/schemas"
import { STORY_PHOTOS_MAX } from "../../lib/admin/story-images"
import { designGoogleOfferImage } from "../lib/google-offer-image"
import { productSaleFlow } from "../lib/product-sale-flow"

const inputSchema = z.object({
  target: googleBusinessTargetSchema,
  brief: z
    .string()
    .trim()
    .min(20)
    .max(2000)
    .describe(
      "The exact offer facts, brief artwork copy and visual direction."
    ),
  photos: z
    .array(z.string().refine(isViewablePath))
    .min(1)
    .max(STORY_PHOTOS_MAX)
    .describe(
      "Existing photo paths from the owner's uploads, source news or products."
    ),
})

export default defineTool({
  deferred: true,
  description:
    "Design one 1200 × 900 image for a Google Business Offer, in the Product sale flow or on the owner's standalone request. Provide source promotion artwork or product photos, excluding finished Instagram Stories. Read the selected Google location and verify writes are enabled first. This costs money and stages the design privately. Inspect it with view_photos for product accuracy, legibility and contact details before proposing it with googlebusiness__save_post. Do not repeat a paid call after an error or use it for revisions.",
  inputSchema,
  label: {
    start: () => "Design the Google Offer image",
    complete: (_input, output) =>
      output && "design" in output
        ? "Designed the Google Offer image"
        : "Couldn’t design the Google Offer image",
  },
  async execute(input, ctx) {
    const inSaleFlow = productSaleFlow.get().step === "google"
    const result = await designGoogleOfferImage(input, ctx)
    if (inSaleFlow && "design" in result) {
      const { path } = result.design
      productSaleFlow.update((state) =>
        state.step === "google" ? { ...state, googleOfferImage: path } : state
      )
    }
    return result
  },
})
