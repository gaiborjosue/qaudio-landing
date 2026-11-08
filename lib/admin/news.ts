import type { AdminNewsItem } from "./preview"

export type NewsStatus = "draft" | "scheduled" | "published"
export type NewsChatStart = (post?: AdminNewsItem) => void

export function newsStatus(post: AdminNewsItem, now: string): NewsStatus {
  if (post.status !== "published" || !post.publishedAt) return "draft"
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
