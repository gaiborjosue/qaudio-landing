"use client"

import Image from "next/image"
import { previewToolName } from "@/lib/admin/tool-names"
import { DealCard } from "@/components/deal-card"
import { NewsBody } from "@/components/news-body"
import { NewsCard } from "@/components/news-card"
import { ProductCatalog, ProductPageView } from "@/components/product-catalog"
import { StoreHours } from "@/components/store-hours"
import { InstagramPreview } from "@/components/admin/instagram-preview"
import {
  changeFromInput,
  dealFromInput,
  newsFromInput,
  productFromInput,
  productsInOrder,
  withChange,
  withWeek,
  withoutChange,
  type AdminDealItem,
  type AdminNewsItem,
  type AdminProduct,
  type AdminSchedule,
  type CatalogTaxonomy,
} from "@/lib/admin/preview"
import {
  dealInputSchema,
  deleteDealInputSchema,
  deleteHoursChangeInputSchema,
  deleteInstagramPostInputSchema,
  deleteNewsPostInputSchema,
  deleteProductInputSchema,
  hoursChangeInputSchema,
  instagramPostInputSchema,
  newsPostInputSchema,
  productInputSchema,
  reorderProductsInputSchema,
  retryInstagramPostInputSchema,
  weeklyHoursInputSchema,
  type InstagramPostInput,
} from "@/lib/admin/schemas"
import { formatStoreDateTime, toStoreDateTime } from "@/lib/admin/store-time"
import { descriptionFromColumns } from "@/lib/catalog"
import {
  addDays,
  formatChangeDates,
  formatHours,
  formatMonthDay,
  storeClock,
  type StoreSchedule,
} from "@/lib/store-hours"
import visitStyles from "../visit-section.module.css"
import styles from "./admin.module.css"

// Keep the public import used by the chat.
export { SAVE_TOOLS } from "@/lib/admin/tool-names"

export type PreviewData = {
  schedule: AdminSchedule
  taxonomy: CatalogTaxonomy
  products: AdminProduct[]
  /** For the Edit menu's lists. */
  news: AdminNewsItem[]
  deals: AdminDealItem[]
}

/** The visit section's hours column (photo, glass, and list) as it would read. */
function HoursPreview({ schedule }: { schedule: StoreSchedule }) {
  return (
    <div className={styles.hoursPreview}>
      <div className={visitStyles.backdrop} aria-hidden="true">
        <Image src="/store-interior.jpeg" alt="" fill sizes="480px" />
      </div>
      <StoreHours schedule={schedule} />
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className={styles.previewNote}>{children}</p>
}

function dealTiming(
  status: string,
  startsAt: string | null,
  endsAt: string | null
) {
  if (status !== "published") return "Draft, hidden from /qdeal"
  const now = toStoreDateTime(new Date())
  if (endsAt && endsAt <= now) {
    return `Ended ${formatStoreDateTime(endsAt)}, hidden from /qdeal`
  }
  const until = endsAt ? ` until ${formatStoreDateTime(endsAt)}` : ""
  if (startsAt && startsAt > now) {
    return `Shows on /qdeal from ${formatStoreDateTime(startsAt)}${until}`
  }
  return `Live on /qdeal${until}`
}

function newsTiming(slug: string, status: string, publishedAt: string | null) {
  if (status !== "published") return `/news/${slug} · Draft, hidden from /news`
  if (!publishedAt || publishedAt === "now") {
    return `/news/${slug} · Published when approved`
  }
  return publishedAt > toStoreDateTime(new Date())
    ? `/news/${slug} · Scheduled for ${formatStoreDateTime(publishedAt)}`
    : `/news/${slug} · Published ${formatStoreDateTime(publishedAt)}`
}

function instagramTiming(post: InstagramPostInput) {
  const what =
    post.kind === "story"
      ? "Story"
      : post.photos.length > 1
        ? `Carousel of ${post.photos.length}`
        : "Photo post"
  const when =
    post.when === "draft"
      ? "Draft in Zernio, not posted"
      : post.when === "now"
        ? "Posts to Instagram when approved"
        : `Scheduled for ${formatStoreDateTime(post.when)}`
  return `${post.id ? "Changes a saved post · " : ""}${what} · ${when}`
}

/**
 * A product proposal from before the description became one Markdown field
 * (an intro, feature bullets, and a closing line), as it reads now, so older
 * chats still show their previews.
 */
function withDescription(input: unknown) {
  if (!input || typeof input !== "object" || "description" in input) {
    return input
  }
  const { description_intro, features, description_closing, ...rest } =
    input as Record<string, unknown>
  if (typeof description_intro !== "string") return input
  return {
    ...rest,
    description: descriptionFromColumns({
      description_intro,
      features: Array.isArray(features) ? features.map(String) : [],
      description_closing:
        typeof description_closing === "string" ? description_closing : "",
    }),
  }
}

/**
 * A save tool's proposed change, drawn with the site's own components. The
 * input comes from the model, so it's checked again here; anything that
 * doesn't parse shows as a note instead of a broken preview. Listings and
 * cards are inert, so their links can't leave the chat.
 */
export function ChangePreview({
  tool,
  input,
  data,
  photoOrder,
}: {
  tool: string
  input: unknown
  data: PreviewData
  /** A pending carousel's photo order, which the owner may rearrange. */
  photoOrder?: { order: number[] | null; onOrder: (order: number[]) => void }
}) {
  switch (previewToolName(tool)) {
    case "set_weekly_hours": {
      const parsed = weeklyHoursInputSchema.safeParse(input)
      if (!parsed.success) break
      return <HoursPreview schedule={withWeek(data.schedule, parsed.data)} />
    }
    case "save_hours_change": {
      const parsed = hoursChangeInputSchema.safeParse(input)
      if (!parsed.success) break
      const change = changeFromInput(parsed.data)
      // The site lists a change in its notice from 60 days before it starts.
      const listedFrom = addDays(change.start, -60)
      const today = storeClock(new Date()).date
      return (
        <>
          <Note>
            {formatChangeDates(change)} ·{" "}
            {typeof change.hours === "object"
              ? `Open ${formatHours(change.hours)}`
              : formatHours(change.hours)}
            {change.note && ` · ${change.note}`}
            {listedFrom > today &&
              ` · Listed on the site from ${formatMonthDay(listedFrom)}`}
          </Note>
          <HoursPreview schedule={withChange(data.schedule, parsed.data)} />
        </>
      )
    }
    case "delete_hours_change": {
      const parsed = deleteHoursChangeInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <>
          <Note>Removes “{parsed.data.summary}”.</Note>
          <HoursPreview
            schedule={withoutChange(data.schedule, parsed.data.id)}
          />
        </>
      )
    }
    case "save_product": {
      const parsed = productInputSchema.safeParse(withDescription(input))
      if (!parsed.success) break
      const result = productFromInput(parsed.data, data.taxonomy)
      if ("problem" in result) return <Note>{result.problem}</Note>
      return (
        <>
          <Note>
            /products/{parsed.data.slug} ·{" "}
            {parsed.data.status === "published"
              ? "Published in the shop"
              : "Draft, hidden from the shop"}
          </Note>
          <div className={styles.productPreview}>
            <ProductPageView product={result.product} />
          </div>
        </>
      )
    }
    case "delete_product": {
      const parsed = deleteProductInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <Note>
          Deletes {parsed.data.name} and its photo list from the shop. Saving it
          as a draft hides it instead.
        </Note>
      )
    }
    case "reorder_products": {
      const parsed = reorderProductsInputSchema.safeParse(input)
      if (!parsed.success) break
      const { category_slug, brand_slug, product_ids } = parsed.data
      const { ordered, unknown } = productsInOrder(product_ids, data.products)
      const scope = category_slug
        ? (data.taxonomy.categories.find((item) => item.slug === category_slug)
            ?.name ?? category_slug)
        : brand_slug
          ? (data.taxonomy.brands.find((item) => item.slug === brand_slug)
              ?.name ?? brand_slug)
          : "All products"
      const drafts = ordered.filter((product) => product.status !== "published")
      return (
        <>
          <Note>
            {scope}
            {drafts.length > 0 &&
              ` · Drafts keep their place but stay hidden: ${drafts
                .map((product) => product.name)
                .join(", ")}`}
            {unknown > 0 &&
              ` · ${unknown} not shown (added since this page loaded)`}
          </Note>
          <div className={styles.listPreview} inert>
            <ProductCatalog
              products={ordered.filter(
                (product) => product.status === "published"
              )}
            />
          </div>
        </>
      )
    }
    case "save_news_post": {
      const parsed = newsPostInputSchema.safeParse(input)
      if (!parsed.success) break
      const { card, body } = newsFromInput(parsed.data)
      return (
        <>
          <Note>
            {newsTiming(
              parsed.data.slug,
              parsed.data.status,
              parsed.data.published_at
            )}
            {!card && " · Needs a cover photo to publish"}
          </Note>
          {card && (
            <div className={styles.cardPreview} inert>
              <NewsCard post={card} position={1} total={1} />
            </div>
          )}
          <div className={styles.articlePreview}>
            <p className={styles.articleTitle}>{parsed.data.title}</p>
            <NewsBody blocks={body} />
          </div>
        </>
      )
    }
    case "delete_news_post": {
      const parsed = deleteNewsPostInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <Note>
          Deletes “{parsed.data.title}” and its page. Saving it as a draft hides
          it instead.
        </Note>
      )
    }
    case "save_deal": {
      const parsed = dealInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <>
          <Note>
            {dealTiming(
              parsed.data.status,
              parsed.data.starts_at,
              parsed.data.ends_at
            )}
          </Note>
          <div className={styles.cardPreview}>
            <DealCard deal={dealFromInput(parsed.data)} />
          </div>
        </>
      )
    }
    case "delete_deal": {
      const parsed = deleteDealInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <Note>
          Deletes “{parsed.data.title}” and its products from /qdeal. Saving it
          as a draft hides it instead.
        </Note>
      )
    }
    case "save_instagram_post": {
      const parsed = instagramPostInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <>
          <Note>{instagramTiming(parsed.data)}</Note>
          <InstagramPreview post={parsed.data} arrange={photoOrder} />
        </>
      )
    }
    case "delete_instagram_post": {
      const parsed = deleteInstagramPostInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <Note>
          {parsed.data.summary} · Deleted from Zernio, it never goes out on
          Instagram.
        </Note>
      )
    }
    case "retry_instagram_post": {
      const parsed = retryInstagramPostInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <Note>
          {parsed.data.summary} · Sent to Instagram again right away, as it is.
        </Note>
      )
    }
  }
  return <Note>No preview for this change.</Note>
}
