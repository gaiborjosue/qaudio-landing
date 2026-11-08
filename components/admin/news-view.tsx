"use client"

import { useEffect, useState } from "react"
import { Plus, Search, WandSparkles } from "lucide-react"
import type { AdminNewsItem } from "@/lib/admin/preview"
import { filterNews, newsStatus, type NewsStatus } from "@/lib/admin/news"
import { formatStoreDateTime, toStoreDateTime } from "@/lib/admin/store-time"
import { HaloButton } from "@/components/ui/halo-button"
import admin from "./admin.module.css"
import page from "./products-view.module.css"
import table from "./metadata.module.css"
import styles from "./news-view.module.css"

const STATUS_LABELS = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
} as const

export function NewsView({
  posts,
  active,
  disabled,
  onTune,
  initialNow,
}: {
  posts: AdminNewsItem[]
  active: boolean
  disabled: boolean
  onTune: (post?: AdminNewsItem) => void
  initialNow: string
}) {
  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<NewsStatus | "all">("all")
  const [now, setNow] = useState(initialNow)

  useEffect(() => {
    if (!active) return
    const update = () => setNow(toStoreDateTime(new Date()))
    update()
    const timer = window.setInterval(update, 30_000)
    return () => window.clearInterval(timer)
  }, [active])

  const visible = filterNews(posts, search, status, now)

  return (
    <div className={page.page}>
      <div className={page.head}>
        <h2>News</h2>
        <p className={page.total} role="status">
          {visible.length} of {posts.length}{" "}
          {posts.length === 1 ? "post" : "posts"}
        </p>
        <button
          type="button"
          className={`${admin.primary} ${page.new}`}
          disabled={disabled}
          onClick={() => onTune()}
        >
          <Plus size={16} aria-hidden="true" />
          New post
        </button>
      </div>
      <div className={table.toolbar}>
        <label className={table.search}>
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search news</span>
          <input
            type="search"
            placeholder="Search news…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className={styles.filter}>
          <span className="sr-only">News status</span>
          <select
            value={status}
            onChange={(event) => {
              const value = event.target.value
              if (
                value === "all" ||
                value === "draft" ||
                value === "scheduled" ||
                value === "published"
              )
                setStatus(value)
            }}
          >
            <option value="all">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        className={table.tableFrame}
        role="region"
        aria-label="News posts"
        tabIndex={0}
      >
        <table className={`${table.table} ${styles.table}`}>
          <caption className="sr-only">
            News posts, including drafts and scheduled posts
          </caption>
          <thead>
            <tr>
              <th scope="col">Post</th>
              <th scope="col">Status</th>
              <th scope="col">Publication</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((post) => {
              const state = newsStatus(post, now)
              return (
                <tr key={post.id}>
                  <th scope="row" className={styles.title}>
                    {post.title}
                    <span className={table.slug}>/news/{post.slug}</span>
                  </th>
                  <td>
                    <span className={styles.status}>
                      {STATUS_LABELS[state]}
                    </span>
                  </td>
                  <td className={styles.date}>
                    {post.publishedAt ? (
                      <time dateTime={post.publishedAt}>
                        {formatStoreDateTime(post.publishedAt)}
                      </time>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <HaloButton
                      type="button"
                      idleClassName={`${admin.secondary} ${styles.tune}`}
                      aria-label={`Edit “${post.title}” with Tune`}
                      disabled={disabled}
                      onClick={() => onTune(post)}
                    >
                      <WandSparkles size={15} aria-hidden="true" />
                      Edit with Tune
                    </HaloButton>
                  </td>
                </tr>
              )
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className={table.empty}>
                  {posts.length === 0
                    ? "No news posts yet."
                    : "No matching posts."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
