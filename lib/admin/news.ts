import type { AdminNewsItem } from "./preview"

import { toStoreDateTime } from "./store-time"

export type NewsStatus = "draft" | "scheduled" | "published" | "expired"
export type NewsChatStart = (post?: AdminNewsItem) => void

export const NEWS_SALE_COLUMNS =
  "expires_at, has_linked_sales, products(status, sale_starts_at, sale_ends_at)" as const

export function newsSaleDetails(post: {
  expires_at: string | null
  has_linked_sales: boolean
  products: {
    status: string
    sale_starts_at: string | null
    sale_ends_at: string | null
  }[]
}): Pick<AdminNewsItem, "expiresAt" | "linkedSales"> {
  return {
    expiresAt: post.expires_at && toStoreDateTime(post.expires_at),
    linkedSales: post.has_linked_sales
      ? post.products.flatMap((product) =>
          product.sale_ends_at
            ? [
                {
                  published: product.status === "published",
                  startsAt:
                    product.sale_starts_at &&
                    toStoreDateTime(product.sale_starts_at),
                  endsAt: toStoreDateTime(product.sale_ends_at),
                },
              ]
            : []
        )
      : null,
  }
}

export function newsExpired(
  post: Pick<AdminNewsItem, "expiresAt" | "linkedSales">,
  now: string
) {
  return (
    (post.expiresAt != null && post.expiresAt <= now) ||
    (post.linkedSales != null &&
      !post.linkedSales.some((sale) => sale.published && sale.endsAt > now))
  )
}

export function scheduledNewsSales(
  post: Pick<AdminNewsItem, "linkedSales">,
  now: string
) {
  return (
    post.linkedSales?.filter((sale) => sale.startsAt && sale.startsAt > now)
      .length ?? 0
  )
}

export function newsStatus(
  post: Pick<
    AdminNewsItem,
    "status" | "publishedAt" | "expiresAt" | "linkedSales"
  >,
  now: string
): NewsStatus {
  if (post.status !== "published" || !post.publishedAt) return "draft"
  if (newsExpired(post, now)) return "expired"
  return post.publishedAt > now ? "scheduled" : "published"
}

export function filterNews(
  posts: AdminNewsItem[],
  search: string,
  status: NewsStatus | "all",
  now: string
) {
  const fold = (text: string) =>
    text
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
  const query = fold(search.trim())
  return posts.filter(
    (post) =>
      (status === "all" || newsStatus(post, now) === status) &&
      fold(`${post.title} ${post.slug}`).includes(query)
  )
}

export function newsChatMessage(post?: AdminNewsItem) {
  return post
    ? `I want to edit the news post “${post.title}”.\nItem: news_post ${post.id}`
    : "I want to create a news post."
}
