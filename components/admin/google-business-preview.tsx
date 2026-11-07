"use client"

import type { GoogleBusinessPostInput } from "@/lib/admin/schemas"
import { mediaUrl } from "@/lib/media"
import { formatStoreDateTime } from "@/lib/admin/store-time"
import styles from "./google-business-preview.module.css"

/** Matches the exact 1200×900 contained JPEG sent to Zernio. Links inert. */
export function GoogleBusinessPostPreview({
  post,
}: {
  post: GoogleBusinessPostInput
}) {
  return (
    <section
      className={styles.preview}
      aria-label="Google Business post preview"
    >
      <p className={styles.meta}>
        Google Business · {post.target.business} · {post.target.location_id}
      </p>
      {post.photo && (
        <div className={styles.photo}>
          {/* eslint-disable-next-line @next/next/no-img-element -- private chat uploads require authenticated browser loading */}
          <img
            crossOrigin="anonymous"
            src={mediaUrl(post.photo.path)}
            alt={post.photo.alt}
            loading="lazy"
          />
        </div>
      )}
      <p className={styles.content}>{post.content}</p>
      {post.call_to_action && (
        <div inert className={styles.action}>
          <a href={post.call_to_action.url} tabIndex={-1}>
            {post.call_to_action.type.replaceAll("_", " ")}
          </a>
          <span>{post.call_to_action.url}</span>
        </div>
      )}
      <p className={styles.meta}>
        {post.when === "now"
          ? "Posts to Google Business when approved"
          : post.when === "draft"
            ? "Draft in Zernio"
            : `Scheduled for ${formatStoreDateTime(post.when)}`}
      </p>
    </section>
  )
}
