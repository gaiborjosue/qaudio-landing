import { z } from "zod"
import {
  hashtagCount,
  INSTAGRAM_CAPTION_MAX,
  INSTAGRAM_HASHTAGS_MAX,
  INSTAGRAM_MENTIONS_MAX,
  INSTAGRAM_PHOTO_SOURCES,
  INSTAGRAM_PHOTOS_MAX,
  INSTAGRAM_SCHEDULE_DAYS,
  instagramScheduleProblem,
  mentionCount,
} from "./instagram"
import { STORE_DATETIME } from "./store-time"

// Inputs of the admin agent's write tools. The agent validates tool calls with
// them, and the admin chat renders previews from the same (validated) input.
// They mirror the database checks in supabase/migrations.

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE = /^\d{4}-\d{2}-\d{2}$/

const time = z.string().regex(TIME, "Use 24-hour HH:MM store time.")
const date = z.string().regex(DATE, "Use YYYY-MM-DD.")
const slug = z.string().regex(SLUG, "Lowercase words joined by dashes.")

/** Where the admin chat uploads photos; save tools move them into place. */
export const UPLOADS = "uploads/"

// Media bucket paths: relative, no leading slash or "..", as lib/news-data.ts
// accepts them.
const mediaPath = z
  .string()
  .max(300)
  .regex(
    /^[\w.-]+(\/[\w.-]+)*$/,
    "A media bucket path, such as uploads/<file>."
  )
  .refine((path) => !path.split("/").includes(".."), "No “..” in paths.")

export const HOURS_KINDS = ["open", "appointment", "closed"] as const

/** One day's hours: times only when the store is open. */
export const dayHoursSchema = z
  .object({
    kind: z.enum(HOURS_KINDS),
    opens_at: time.optional().describe("Only when kind is open."),
    closes_at: time.optional().describe("Only when kind is open."),
  })
  .superRefine((day, ctx) => {
    if (day.kind !== "open") {
      if (day.opens_at || day.closes_at) {
        ctx.addIssue({
          code: "custom",
          message: "Only open days have times.",
        })
      }
      return
    }
    if (!day.opens_at || !day.closes_at || day.opens_at >= day.closes_at) {
      ctx.addIssue({
        code: "custom",
        message: "An open day needs opens_at before closes_at.",
      })
    }
  })

export const weeklyHoursInputSchema = z.object({
  week: z
    .array(dayHoursSchema)
    .length(7)
    .describe("All seven days, Monday first."),
})

export const hoursChangeInputSchema = z
  .object({
    id: z
      .uuid()
      .optional()
      .describe("An existing change's id to edit it; omit to add a new one."),
    starts_on: date.describe("First affected date, store time."),
    ends_on: date.describe(
      "Last affected date, inclusive; equal to starts_on for one day."
    ),
    kind: z.enum(HOURS_KINDS),
    opens_at: time.optional().describe("Only when kind is open."),
    closes_at: time.optional().describe("Only when kind is open."),
    note: z
      .string()
      .max(200)
      .default("")
      .describe(
        'Optional short reason shown with the change, such as "Thanksgiving".'
      ),
  })
  .superRefine((change, ctx) => {
    if (change.ends_on < change.starts_on) {
      ctx.addIssue({ code: "custom", message: "ends_on is before starts_on." })
    }
    const day = dayHoursSchema.safeParse(change)
    if (!day.success) {
      for (const issue of day.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message })
      }
    }
  })

export const deleteHoursChangeInputSchema = z.object({
  id: z.uuid(),
  summary: z
    .string()
    .min(1)
    .max(200)
    .describe(
      'What is being removed, for the approval card, e.g. "Closed Nov 7–15".'
    ),
})

export const productImageInputSchema = z.object({
  path: mediaPath
    .refine(
      (path) => path.startsWith("products/") || path.startsWith(UPLOADS),
      "Use a products/ path or an uploaded photo's uploads/ path."
    )
    .describe(
      "Path in the media bucket: an uploaded photo's uploads/ path, or an existing products/ path."
    ),
  alt: z.string().trim().min(1).max(300).describe("What the photo shows."),
  width: z.int().positive(),
  height: z.int().positive(),
})

// Products are saved and deleted in the admin's Products tab (Server Actions
// validated with these); older chats' product cards still render from them.
export const productInputSchema = z.object({
  id: z
    .uuid()
    .optional()
    .describe("An existing product's id to edit it; omit to add a new one."),
  slug: slug.max(120).describe("Its /products/<slug> address."),
  category_slug: slug,
  brand_slug: slug,
  name: z.string().trim().min(1).max(160),
  short_description: z
    .string()
    .max(300)
    .describe("The card line: one sentence, 300 characters at most."),
  description: z
    .string()
    .max(10000)
    .describe(
      "The details page's description, as Markdown: an opening paragraph, then - bullets for features, **bold** for emphasis, [text](https://…) links, and ### headings if it needs sections."
    ),
  price_cents: z
    .int()
    .positive()
    .describe(
      "Current selling price in US cents: 79900 is $799. For a sale, set this below msrp_cents; restore the regular price to end the sale."
    ),
  msrp_cents: z
    .int()
    .positive()
    .nullable()
    .describe(
      "Manufacturer list price in US cents, or null when unknown. Keep it when setting a sale price so the shop can show the comparison."
    ),
  price_unit: z.enum(["each", "pair"]),
  condition: z.enum(["New", "Demo", "Used"]),
  ready_for_audition: z.boolean(),
  manufacturer_url: z
    .url({ protocol: /^https$/ })
    .nullable()
    .describe("The brand's product page (https only), or null."),
  status: z
    .enum(["draft", "published"])
    .describe("published shows it in the shop; draft hides it."),
  sort_order: z
    .int()
    .optional()
    .describe(
      "Lower shows first. Omit to keep an existing product's place; a new one without it gets 0 and shows first. Use products__reorder_products to arrange a whole listing."
    ),
  images: z
    .array(productImageInputSchema)
    .max(20)
    .describe("In display order; the first is the card photo."),
})

/** The copywriter only needs a description; the other details add context. */
export const productCardLineInputSchema = productInputSchema
  .pick({
    name: true,
    brand_slug: true,
    category_slug: true,
    condition: true,
    description: true,
  })
  .partial({ name: true, brand_slug: true, category_slug: true })
  .extend({ description: productInputSchema.shape.description.trim().min(1) })

export const deleteProductInputSchema = z.object({
  id: z.uuid(),
  name: z
    .string()
    .min(1)
    .max(160)
    .describe("The product's name, for the approval card."),
})

export const reorderProductsInputSchema = z
  .object({
    category_slug: slug
      .optional()
      .describe("Reorder this category's products (its /shop/<slug> page)."),
    brand_slug: slug
      .optional()
      .describe("Reorder this brand's products (its /shop?brand=<slug> page)."),
    product_ids: z
      .array(z.uuid())
      .min(1)
      .max(200)
      .describe(
        "Every product in that category or brand (drafts included), first shown first. With neither slug, every product in the shop."
      ),
  })
  .refine(
    (input) => !(input.category_slug && input.brand_slug),
    "Reorder one category or one brand at a time."
  )

// The admin's Products tab: its product form and table save through Server
// Actions, validated with productInputSchema and these.

/** Some of a product's fields: what the product form starts from. */
export const productDraftSchema = productInputSchema
  .omit({ id: true, sort_order: true })
  .partial()

/** One product's short fields, as changed in the product table. */
export const productQuickEditSchema = z
  .object({
    id: z.uuid(),
    price_cents: z.int().positive().optional(),
    condition: z.enum(["New", "Demo", "Used"]).optional(),
    ready_for_audition: z.boolean().optional(),
    status: z.enum(["draft", "published"]).optional(),
  })
  .refine(
    (edit) =>
      Object.entries(edit).some(
        ([key, value]) => key !== "id" && value !== undefined
      ),
    "Change at least one field."
  )

export const productQuickEditsSchema = z
  .array(productQuickEditSchema)
  .min(1)
  .max(200)

// News posts: body blocks follow NewsBlock in lib/news.ts, with image `src`
// as a media path.
const SAFE_HREF = /^(https?:|mailto:|tel:|\/(?!\/))/i

const newsInlineSchema = z.union([
  z.string(),
  z.object({
    text: z.string().min(1),
    strong: z.boolean().optional(),
    href: z
      .string()
      .regex(SAFE_HREF, "Links must be https, mailto:, tel:, or a site path.")
      .max(2000)
      .optional(),
  }),
])

const newsImageSchema = z.object({
  src: mediaPath,
  width: z.int().positive(),
  height: z.int().positive(),
  alt: z.string().trim().min(1).max(500).describe("What the photo shows."),
})

export const newsBlockSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("paragraph"),
    content: z
      .array(newsInlineSchema)
      .min(1)
      .describe(
        'Text runs: plain strings, or { text, strong?, href? }. "\\n" breaks a line.'
      ),
  }),
  z.object({ type: z.literal("heading"), text: z.string().min(1).max(200) }),
  z.object({
    type: z.literal("list"),
    items: z.array(z.array(newsInlineSchema).min(1)).min(1),
  }),
  z.object({ type: z.literal("quote"), text: z.string().min(1).max(1000) }),
  z.object({
    type: z.literal("image"),
    image: newsImageSchema,
    caption: z.string().max(300).optional(),
  }),
])

export const newsPostInputSchema = z
  .object({
    id: z
      .uuid()
      .optional()
      .describe("An existing post's id to edit it; omit to add a new one."),
    slug: slug.max(120).describe("Its /news/<slug> address."),
    title: z.string().trim().min(1).max(200),
    body: z.array(newsBlockSchema).max(200),
    cover: z
      .object({
        path: mediaPath,
        width: z.int().positive(),
        height: z.int().positive(),
        alt: z.string().trim().min(1).max(500),
        fit: z
          .enum(["cover", "contain"])
          .describe("contain letterboxes posters and wide product shots."),
      })
      .nullable()
      .describe("The card and article photo; required to publish."),
    status: z
      .enum(["draft", "published"])
      .describe("published shows it from published_at on; draft hides it."),
    published_at: z
      .union([z.literal("now"), z.string().regex(STORE_DATETIME)])
      .nullable()
      .describe(
        'Store-time "YYYY-MM-DDTHH:MM", or "now". A future time schedules the post. Required to publish.'
      ),
  })
  .superRefine((post, ctx) => {
    if (post.status !== "published") return
    if (!post.cover) {
      ctx.addIssue({
        code: "custom",
        message: "A published post needs a cover.",
      })
    }
    if (!post.published_at) {
      ctx.addIssue({
        code: "custom",
        message: "A published post needs published_at.",
      })
    }
  })

export const deleteNewsPostInputSchema = z.object({
  id: z.uuid(),
  title: z
    .string()
    .min(1)
    .max(200)
    .describe("The post's title, for the approval card."),
})

// QDeal promotions and the products each lists.
export const dealInputSchema = z
  .object({
    id: z
      .uuid()
      .optional()
      .describe("An existing deal's id to edit it; omit to add a new one."),
    title: z.string().trim().min(1).max(200),
    summary: z.string().max(600).describe('Short line under the title, or "".'),
    note: z
      .string()
      .max(200)
      .describe(
        'Closing line under the products, such as "Visit us for pricing.", or "".'
      ),
    status: z
      .enum(["draft", "published"])
      .describe(
        "published shows it on /qdeal inside its dates; draft hides it."
      ),
    starts_at: z
      .string()
      .regex(STORE_DATETIME)
      .nullable()
      .describe('Optional store-time "YYYY-MM-DDTHH:MM" when it appears.'),
    ends_at: z
      .string()
      .regex(STORE_DATETIME)
      .nullable()
      .describe('Optional store-time "YYYY-MM-DDTHH:MM" when it disappears.'),
    sort_order: z.int().default(0).describe("Lower shows first on /qdeal."),
    items: z
      .array(
        z.object({
          brand: z.string().trim().max(80).describe('Brand label, or "".'),
          name: z.string().trim().min(1).max(160),
          condition: z.enum(["new", "demo"]).nullable(),
          price_cents: z
            .int()
            .positive()
            .nullable()
            .describe("US cents, or null to show no price."),
        })
      )
      .max(50)
      .describe("The deal's products in display order (the whole list)."),
  })
  .refine(
    (deal) => !deal.starts_at || !deal.ends_at || deal.starts_at < deal.ends_at,
    "starts_at must be before ends_at."
  )

export const deleteDealInputSchema = z.object({
  id: z.uuid(),
  title: z
    .string()
    .min(1)
    .max(200)
    .describe("The deal's title, for the approval card."),
})

// Instagram posts, published through Zernio. Ids are Zernio's.
const zernioId = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "A Zernio post id from instagram__list_posts.")

export const instagramPhotoSchema = z.object({
  path: mediaPath
    .refine(
      (path) =>
        INSTAGRAM_PHOTO_SOURCES.some((folder) => path.startsWith(folder)),
      `Use a photo from ${INSTAGRAM_PHOTO_SOURCES.join(", ")}.`
    )
    .describe(
      "Media bucket path: an attached photo's uploads/ path, or a product's, news post's, or earlier Instagram post's saved photo."
    ),
  width: z.int().positive(),
  height: z.int().positive(),
  alt: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .describe("What the photo shows; Instagram's alt text."),
})

/** What the approval card previews; the tool adds the timing check. */
export const instagramPostInputSchema = z
  .object({
    id: zernioId
      .optional()
      .describe(
        "An existing draft or scheduled post's id to change it; omit to add a new one."
      ),
    account: z
      .string()
      .regex(/^@?[A-Za-z0-9_.]{1,30}$/)
      .optional()
      .describe(
        "The Instagram username to post as, from instagram__get_account."
      ),
    kind: z
      .enum(["feed", "story"])
      .describe(
        "feed: one photo, or 2–10 as a carousel. story: one photo, shown for 24 hours, without a caption."
      ),
    photos: z
      .array(instagramPhotoSchema)
      .min(1)
      .max(INSTAGRAM_PHOTOS_MAX)
      .describe("In order; the first sets the post's shape."),
    fit: z
      .enum(["cover", "contain"])
      .optional()
      .describe(
        "cover fills the frame, trimming edges; contain shows each whole photo with bars. Omit for the default: cover for feed posts; for a story, cover only when the photo is already tall."
      ),
    caption: z
      .string()
      .max(INSTAGRAM_CAPTION_MAX)
      .default("")
      .describe(
        `Feed posts only, ${INSTAGRAM_CAPTION_MAX} characters at most; the first 125 show before "more". Hashtags go in the text.`
      ),
    when: z
      .union([
        z.literal("draft"),
        z.literal("now"),
        z.string().regex(STORE_DATETIME),
      ])
      .describe(
        `"draft" keeps it unpublished in Zernio; "now" posts it once approved; a store-time "YYYY-MM-DDTHH:MM" schedules it, at most ${INSTAGRAM_SCHEDULE_DAYS} days ahead.`
      ),
  })
  .superRefine((post, ctx) => {
    if (post.kind === "story") {
      if (post.photos.length !== 1) {
        ctx.addIssue({ code: "custom", message: "A story has one photo." })
      }
      if (post.caption.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Stories have no caption; leave it empty.",
        })
      }
    }
    if (hashtagCount(post.caption) > INSTAGRAM_HASHTAGS_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `Instagram allows ${INSTAGRAM_HASHTAGS_MAX} hashtags at most.`,
      })
    }
    if (mentionCount(post.caption) > INSTAGRAM_MENTIONS_MAX) {
      ctx.addIssue({
        code: "custom",
        message: `Instagram allows ${INSTAGRAM_MENTIONS_MAX} @mentions at most.`,
      })
    }
  })

/** The tool's input: also checks the time is in the next 7 days. */
export const instagramPostProposalSchema = instagramPostInputSchema.superRefine(
  (post, ctx) => {
    if (post.when === "draft" || post.when === "now") return
    const problem = instagramScheduleProblem(post.when)
    if (problem) ctx.addIssue({ code: "custom", message: problem })
  }
)

const instagramPostReference = {
  id: zernioId,
  summary: z
    .string()
    .min(1)
    .max(200)
    .describe(
      'Which post, for the approval card, e.g. "Scheduled Nov 7, 6:00 pm: “The Orbit Theory is in…”".'
    ),
}

export const deleteInstagramPostInputSchema = z.object(instagramPostReference)
export const retryInstagramPostInputSchema = z.object(instagramPostReference)

export type DayHoursInput = z.infer<typeof dayHoursSchema>
export type WeeklyHoursInput = z.infer<typeof weeklyHoursInputSchema>
export type HoursChangeInput = z.infer<typeof hoursChangeInputSchema>
export type DeleteHoursChangeInput = z.infer<
  typeof deleteHoursChangeInputSchema
>
export type ProductInput = z.infer<typeof productInputSchema>
export type DeleteProductInput = z.infer<typeof deleteProductInputSchema>
export type ReorderProductsInput = z.infer<typeof reorderProductsInputSchema>
export type ProductDraft = z.infer<typeof productDraftSchema>
export type ProductQuickEdit = z.infer<typeof productQuickEditSchema>
export type NewsBlockInput = z.infer<typeof newsBlockSchema>
export type NewsPostInput = z.infer<typeof newsPostInputSchema>
export type DeleteNewsPostInput = z.infer<typeof deleteNewsPostInputSchema>
export type DealInput = z.infer<typeof dealInputSchema>
export type DeleteDealInput = z.infer<typeof deleteDealInputSchema>
export type InstagramPhotoInput = z.infer<typeof instagramPhotoSchema>
export type InstagramPostInput = z.infer<typeof instagramPostInputSchema>
export type InstagramPostReference = z.infer<
  typeof deleteInstagramPostInputSchema
>
