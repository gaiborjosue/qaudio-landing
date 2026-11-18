"use client"

import { memo } from "react"
import Image from "next/image"
import { previewToolName } from "@/lib/admin/tool-names"
import { DEAL_KIND_LABELS, DEAL_PAGES } from "@/lib/deals"
import { DealCard } from "@/components/deal-card"
import { NewsBody } from "@/components/news-body"
import { NewsCard } from "@/components/news-card"
import { StoreHours } from "@/components/store-hours"
import { InstagramPreview } from "@/components/admin/instagram-preview"
import {
  GoogleBusinessHoursPreview,
  GoogleBusinessPostPreview,
} from "@/components/admin/google-business-preview"
import {
  ConditionBadge,
  ProductReviewTable,
  type ReviewColumn,
  type ReviewProduct,
} from "@/components/admin/product-review-table"
import {
  NewProductPreview,
  ProductUpdatesPreview,
  productFromCreate,
} from "@/components/admin/product-change-preview"
import {
  changeFromInput,
  dealFromInput,
  newsFromInput,
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
  createProductInputSchema,
  dealInputSchema,
  deleteDealInputSchema,
  deleteHoursChangeInputSchema,
  deleteInstagramPostInputSchema,
  deleteNewsPostInputSchema,
  deleteProductInputSchema,
  endSaleInputSchema,
  hoursChangeInputSchema,
  instagramPostInputSchema,
  newsPostInputSchema,
  productInputSchema,
  reorderProductsInputSchema,
  retryInstagramPostInputSchema,
  saleInputSchema,
  updateProductsInputSchema,
  weeklyHoursInputSchema,
  googleBusinessHoursInputSchema,
  googleBusinessPostInputSchema,
  deleteGoogleBusinessPostInputSchema,
  type InstagramPostInput,
} from "@/lib/admin/schemas"
import {
  saleDiscountLabel,
  saleStatus,
  saleWindowLabel,
  saleLines,
  type SaleLine,
} from "@/lib/admin/sale"
import { formatStoreDateTime, toStoreDateTime } from "@/lib/admin/store-time"
import { descriptionFromColumns, formatPrice } from "@/lib/catalog"
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
import tableStyles from "./product-table.module.css"

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

const statusLabel = (status: string) =>
  status === "published" ? "Published" : "Draft"

/** "$1,299", or "$1,299 /pair" for a product priced per pair. */
const price = (cents: number | null, unit?: string) =>
  `${formatPrice(cents)}${unit === "pair" && cents !== null ? " /pair" : ""}`

const optionalPrice = (cents: number | null) =>
  cents === null ? "—" : formatPrice(cents)

/** "$250 · 20%": what comes off the price the discount is taken from. */
const savings = (base: number, sale: number) =>
  `${formatPrice(base - sale)} · ${Math.round(((base - sale) / base) * 100)}%`

const productsById = (products: AdminProduct[]) =>
  new Map(products.map((product) => [product.id, product]))

/**
 * A row's product column: the catalog's photo, brand, and draft status when
 * the product is loaded here, else the name the tool was given (a product
 * added since this page loaded).
 */
function reviewProduct(
  product: AdminProduct | undefined,
  name: string
): ReviewProduct {
  const detail = [
    product?.brand?.name,
    product && product.status !== "published" && "Draft",
  ]
    .filter(Boolean)
    .join(" · ")
  return {
    name: product?.name ?? name,
    photo: product?.images[0]?.src,
    detail: detail || undefined,
  }
}

const condition = (product: AdminProduct | undefined) =>
  product ? <ConditionBadge condition={product.condition} /> : "—"

function dealTiming(
  page: string,
  status: string,
  startsAt: string | null,
  endsAt: string | null
) {
  if (status !== "published") return `Draft, hidden from ${page}`
  const now = toStoreDateTime(new Date())
  if (endsAt && endsAt <= now) {
    return `Ended ${formatStoreDateTime(endsAt)}, hidden from ${page}`
  }
  const until = endsAt ? ` until ${formatStoreDateTime(endsAt)}` : ""
  if (startsAt && startsAt > now) {
    return `Shows on ${page} from ${formatStoreDateTime(startsAt)}${until}`
  }
  return `Live on ${page}${until}`
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
 * A save tool's proposed change, drawn with the site's own components;
 * product changes read as the Products tab's table instead, so many
 * products stay reviewable. The input comes from the model, so it's checked
 * again here; anything that doesn't parse shows as a note instead of a
 * broken preview. Listings and cards are inert, so their links can't leave
 * the chat.
 */
export const ChangePreview = memo(function ChangePreview({
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
    case "set_google_business_hours": {
      const parsed = googleBusinessHoursInputSchema.safeParse(input)
      if (!parsed.success) break
      return <GoogleBusinessHoursPreview hours={parsed.data} />
    }
    case "save_google_business_post": {
      const parsed = googleBusinessPostInputSchema.safeParse(input)
      if (!parsed.success) break
      return <GoogleBusinessPostPreview post={parsed.data} />
    }
    case "delete_google_business_post": {
      const parsed = deleteGoogleBusinessPostInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <Note>
          Deletes “{parsed.data.summary}” from Zernio for Google Business ·{" "}
          {parsed.data.target.business} · {parsed.data.target.location_id}.
        </Note>
      )
    }
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
      return <NewProductPreview input={parsed.data} taxonomy={data.taxonomy} />
    }
    case "create_product": {
      const parsed = createProductInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <NewProductPreview
          input={productFromCreate(parsed.data)}
          taxonomy={data.taxonomy}
        />
      )
    }
    case "update_products": {
      const parsed = updateProductsInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <ProductUpdatesPreview
          input={parsed.data}
          products={data.products}
          taxonomy={data.taxonomy}
        />
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
      const now = toStoreDateTime(new Date())
      return (
        <>
          <Note>
            {scope}
            {drafts.length > 0 && " · Drafts keep their place but stay hidden"}
            {unknown > 0 &&
              ` · ${unknown} not shown (added since this page loaded)`}
          </Note>
          {ordered.length > 0 && (
            <ProductReviewTable
              label="Product order"
              numbered
              rows={ordered}
              rowKey={(product) => product.id}
              product={(product) => reviewProduct(product, product.name)}
              columns={[
                {
                  label: "Category",
                  cell: (product) => product.category.name,
                },
                {
                  label: "Condition",
                  cell: (product) => (
                    <ConditionBadge condition={product.condition} />
                  ),
                },
                {
                  label: "Price",
                  numeric: true,
                  cell: (product) => (
                    <>
                      {price(product.price_cents, product.price_unit)}
                      {product.sale_window && (
                        <span className={tableStyles.sale}>
                          {saleStatus(product.sale_window, now)}
                        </span>
                      )}
                    </>
                  ),
                },
                {
                  label: "Status",
                  cell: (product) => statusLabel(product.status),
                },
              ]}
            />
          )}
        </>
      )
    }
    case "save_sale": {
      const parsed = saleInputSchema.safeParse(input)
      if (!parsed.success) break
      const sale = parsed.data
      const lines = saleLines(sale)
      const problems = lines.filter((line) => line.problem).length
      const byId = productsById(data.products)
      const hasMsrp = lines.some((line) => line.msrp_cents !== null)
      // From the prices the tool was given (the ones it saves against).
      const columns: ReviewColumn<SaleLine>[] = [
        {
          label: "Condition",
          cell: (line) => condition(byId.get(line.id)),
        },
        {
          label: "Price",
          numeric: true,
          cell: (line) => formatPrice(line.price_cents),
        },
        ...(hasMsrp
          ? [
              {
                label: "MSRP",
                numeric: true,
                cell: (line: SaleLine) => optionalPrice(line.msrp_cents),
              },
            ]
          : []),
        {
          label: "Sale price",
          numeric: true,
          cell: (line) =>
            line.problem ? (
              "—"
            ) : (
              <span className={tableStyles.strong}>
                {price(line.sale_price_cents, byId.get(line.id)?.price_unit)}
              </span>
            ),
        },
        {
          label: "Off",
          numeric: true,
          cell: (line) =>
            line.problem
              ? "—"
              : savings(line.base_cents, line.sale_price_cents),
        },
      ]
      return (
        <>
          <Note>
            {saleDiscountLabel(sale)} · {saleWindowLabel(sale)} · {lines.length}{" "}
            product{lines.length === 1 ? "" : "s"}
            {problems > 0 && ` · ${problems} can’t go on sale`}
            {sale.news_post_id &&
              ` · Linked to ${data.news.find((post) => post.id === sale.news_post_id)?.title ?? "sale news post"}`}
          </Note>
          <ProductReviewTable
            label="Products on sale"
            rows={lines}
            rowKey={(line) => line.id}
            product={(line) => ({
              ...reviewProduct(byId.get(line.id), line.name),
              problem: line.problem && `Can’t go on sale: ${line.problem}`,
            })}
            columns={columns}
          />
        </>
      )
    }
    case "end_sale": {
      const parsed = endSaleInputSchema.safeParse(input)
      if (!parsed.success) break
      const byId = productsById(data.products)
      const rows = parsed.data.products
      const hasMsrp = rows.some(
        (row) => (byId.get(row.id)?.msrp_cents ?? null) !== null
      )
      const now = toStoreDateTime(new Date())
      const columns: ReviewColumn<(typeof rows)[number]>[] = [
        { label: "Condition", cell: (row) => condition(byId.get(row.id)) },
        {
          label: "Sale",
          cell: (row) => {
            const sale = byId.get(row.id)?.sale_window
            return sale ? saleStatus(sale, now) : "—"
          },
        },
        {
          label: "Regular price",
          numeric: true,
          cell: (row) => {
            const product = byId.get(row.id)
            return product ? (
              <span className={tableStyles.strong}>
                {price(product.price_cents, product.price_unit)}
              </span>
            ) : (
              "—"
            )
          },
        },
        ...(hasMsrp
          ? [
              {
                label: "MSRP",
                numeric: true,
                cell: (row: (typeof rows)[number]) =>
                  optionalPrice(byId.get(row.id)?.msrp_cents ?? null),
              },
            ]
          : []),
      ]
      return (
        <>
          <Note>{parsed.data.title} · Regular prices show again now</Note>
          <ProductReviewTable
            label="Products leaving the sale"
            rows={rows}
            rowKey={(row) => row.id}
            product={(row) => reviewProduct(byId.get(row.id), row.name)}
            columns={columns}
          />
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
            {parsed.data.expires_at &&
              ` · Expires ${formatStoreDateTime(parsed.data.expires_at)}`}
            {!card && " · Needs a cover photo to publish"}
          </Note>
          <div className={styles.newsPreview}>
            {card && (
              <section
                aria-label="News feed preview"
                className={styles.newsGridPreview}
              >
                <p className={styles.newsPreviewLabel}>Feed</p>
                <div inert>
                  <NewsCard post={card} position={1} total={1} compact />
                </div>
              </section>
            )}
            <section
              aria-label="News article preview"
              className={styles.newsArticlePreview}
              tabIndex={0}
            >
              <p className={styles.newsPreviewLabel}>Article</p>
              <div>
                <p className={styles.articleTitle}>{parsed.data.title}</p>
                <NewsBody blocks={body} compact />
              </div>
            </section>
          </div>
        </>
      )
    }
    case "delete_news_post": {
      const parsed = deleteNewsPostInputSchema.safeParse(input)
      if (!parsed.success) break
      return (
        <Note>
          Deletes “{parsed.data.title}” and its page.
          {parsed.data.sale_choice === "cancel" &&
            " Cancels its linked scheduled sale prices."}
          {parsed.data.sale_choice === "keep" &&
            " Keeps its linked scheduled sale prices."}
        </Note>
      )
    }
    case "save_deal": {
      const parsed = dealInputSchema.safeParse(input)
      if (!parsed.success) break
      const saved = data.deals.find((deal) => deal.id === parsed.data.id)
      // An edit that leaves out its kind keeps the saved one.
      const kind = parsed.data.kind ?? saved?.kind ?? "qdeal"
      return (
        <>
          <Note>
            {DEAL_KIND_LABELS[kind]} ·{" "}
            {dealTiming(
              DEAL_PAGES[kind],
              parsed.data.status,
              parsed.data.starts_at,
              parsed.data.ends_at
            )}
          </Note>
          <div className={styles.cardPreview} inert>
            <DealCard
              deal={dealFromInput(parsed.data, saved?.image, data.products)}
              showEnd={kind === "sale"}
            />
          </div>
        </>
      )
    }
    case "delete_deal": {
      const parsed = deleteDealInputSchema.safeParse(input)
      if (!parsed.success) break
      const kind =
        data.deals.find((deal) => deal.id === parsed.data.id)?.kind ?? "qdeal"
      return (
        <Note>
          Deletes “{parsed.data.title}” and its products from {DEAL_PAGES[kind]}
          . Saving it as a draft hides it instead.
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
})
