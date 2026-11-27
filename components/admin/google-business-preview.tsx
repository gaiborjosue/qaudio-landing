"use client"

import { CalendarDays, Clock3, MapPin } from "lucide-react"
import type {
  GoogleBusinessHoursInput,
  GoogleBusinessPostInput,
} from "@/lib/admin/schemas"
import { mediaUrl } from "@/lib/media"
import { formatStoreDateTime, fromStoreDateTime } from "@/lib/admin/store-time"
import { GOOGLE_BUSINESS_POST_LABELS } from "@/lib/admin/google-business-types"
import { formatHours, WEEKDAYS } from "@/lib/store-hours"
import styles from "./google-business-preview.module.css"

const hoursDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
})
const hoursWeekday = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "long",
})

/** Only the proposed Google schedule; never infer Google's current hours from the site. */
export function GoogleBusinessHoursPreview({
  hours,
}: {
  hours: GoogleBusinessHoursInput
}) {
  return (
    <section
      className={`${styles.preview} ${styles.hoursPreview}`}
      aria-label="Proposed Google Business hours"
    >
      <header className={styles.hoursHeader}>
        <MapPin size={18} strokeWidth={1.5} aria-hidden="true" />
        <div>
          <p className={styles.destination}>Google Business</p>
          <p className={styles.business}>{hours.target.business}</p>
        </div>
      </header>
      {hours.changes.length > 0 && (
        <section className={styles.hoursGroup} aria-label="Special hours">
          <h3 className={styles.hoursHeading}>
            <CalendarDays size={15} aria-hidden="true" />
            Special hours
          </h3>
          <dl className={styles.hoursList}>
            {hours.changes
              .toSorted((a, b) => a.starts_on.localeCompare(b.starts_on))
              .map((change) => {
                const start = new Date(`${change.starts_on}T12:00:00Z`)
                const end = new Date(`${change.ends_on}T12:00:00Z`)
                const singleDay = change.starts_on === change.ends_on
                const label =
                  change.kind === "regular"
                    ? "Regular hours"
                    : change.kind === "closed"
                      ? "Closed"
                      : formatHours({
                          open: change.opens_at!,
                          close: change.closes_at!,
                        })
                return (
                  <div key={change.starts_on} className={styles.hoursRow}>
                    <dt>
                      <span className={styles.hoursDate}>
                        {singleDay
                          ? hoursDate.format(start)
                          : hoursDate.formatRange(start, end)}
                      </span>
                      <span className={styles.hoursDetail}>
                        {singleDay
                          ? hoursWeekday.format(start)
                          : "Every day in this range"}
                      </span>
                    </dt>
                    <dd>
                      <span
                        className={
                          change.kind === "closed"
                            ? styles.closedHours
                            : styles.newHours
                        }
                      >
                        {label}
                      </span>
                      {change.kind === "regular" && (
                        <span className={styles.hoursDetail}>
                          Special hours removed
                        </span>
                      )}
                    </dd>
                  </div>
                )
              })}
          </dl>
        </section>
      )}
      {hours.week && (
        <section
          className={styles.hoursGroup}
          aria-label="Regular weekly hours"
        >
          <h3 className={styles.hoursHeading}>
            <Clock3 size={15} aria-hidden="true" />
            Regular hours
          </h3>
          <dl className={styles.hoursList}>
            {hours.week.map((day, index) => (
              <div key={WEEKDAYS[index]} className={styles.hoursRow}>
                <dt>{WEEKDAYS[index]}</dt>
                <dd>
                  <span
                    className={
                      day.kind === "closed"
                        ? styles.closedHours
                        : styles.newHours
                    }
                  >
                    {day.kind === "open"
                      ? formatHours({
                          open: day.opens_at!,
                          close: day.closes_at!,
                        })
                      : "Closed"}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </section>
  )
}

/** Matches the exact 1200×900 contained JPEG sent to Zernio. Links inert. */
export function GoogleBusinessPostPreview({
  post,
}: {
  post: GoogleBusinessPostInput
}) {
  const kind = GOOGLE_BUSINESS_POST_LABELS[post.kind]
  const action =
    post.kind === "offer"
      ? { label: "View Offer", url: post.offer?.redemption_url }
      : post.call_to_action && {
          label: post.call_to_action.type.replaceAll("_", " "),
          url: post.call_to_action.url,
        }
  return (
    <section
      className={styles.preview}
      aria-label={`Google Business ${kind} preview`}
    >
      <p className={styles.meta}>
        Google Business · {kind} · {post.target.business} ·{" "}
        {post.target.location_id}
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
      {post.window && (
        <>
          <h4 className={styles.postTitle}>{post.window.title}</h4>
          <dl className={styles.postDetails}>
            <dt>Starts</dt>
            <dd>
              <time dateTime={fromStoreDateTime(post.window.starts_at)}>
                {formatStoreDateTime(post.window.starts_at)} ET
              </time>
            </dd>
            <dt>{post.kind === "offer" ? "Expires" : "Ends"}</dt>
            <dd>
              <time dateTime={fromStoreDateTime(post.window.ends_at)}>
                {formatStoreDateTime(post.window.ends_at)} ET
              </time>
            </dd>
            {post.offer?.coupon_code && (
              <>
                <dt>Coupon</dt>
                <dd>{post.offer.coupon_code}</dd>
              </>
            )}
            {post.offer?.terms && (
              <>
                <dt>Terms</dt>
                <dd>{post.offer.terms}</dd>
              </>
            )}
          </dl>
        </>
      )}
      <p className={styles.content}>{post.content}</p>
      {action && (
        <div inert className={styles.action}>
          {action.url ? (
            <>
              <a
                href={action.url}
                tabIndex={-1}
                className={styles.actionButton}
              >
                {action.label}
              </a>
              <span>{action.url}</span>
            </>
          ) : (
            <span className={styles.actionButton}>{action.label}</span>
          )}
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
