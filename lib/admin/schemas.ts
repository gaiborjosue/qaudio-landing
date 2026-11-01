import { z } from "zod"
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

export const productInputSchema = z.object({
  id: z
    .uuid()
    .optional()
    .describe("An existing product's id to edit it; omit to add a new one."),
  slug: slug.max(120).describe("Its /products/<slug> address."),
  category_slug: slug,
  brand_slug: slug,
  name: z.string().trim().min(1).max(160),
  short_description: z.string().max(300).describe("The card line."),
  description_intro: z.string().max(2000),
  features: z.array(z.string().trim().min(1).max(400)).max(30),
  description_closing: z.string().max(1000),
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
      "Lower shows first. Omit to keep an existing product's place; a new one without it gets 0 and shows first. Use reorder_products to arrange a whole listing."
    ),
  images: z
    .array(productImageInputSchema)
    .max(20)
    .describe("In display order; the first is the card photo."),
})

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

export type DayHoursInput = z.infer<typeof dayHoursSchema>
export type WeeklyHoursInput = z.infer<typeof weeklyHoursInputSchema>
export type HoursChangeInput = z.infer<typeof hoursChangeInputSchema>
export type DeleteHoursChangeInput = z.infer<
  typeof deleteHoursChangeInputSchema
>
export type ProductInput = z.infer<typeof productInputSchema>
export type DeleteProductInput = z.infer<typeof deleteProductInputSchema>
export type ReorderProductsInput = z.infer<typeof reorderProductsInputSchema>
export type NewsBlockInput = z.infer<typeof newsBlockSchema>
export type NewsPostInput = z.infer<typeof newsPostInputSchema>
export type DeleteNewsPostInput = z.infer<typeof deleteNewsPostInputSchema>
export type DealInput = z.infer<typeof dealInputSchema>
export type DeleteDealInput = z.infer<typeof deleteDealInputSchema>
