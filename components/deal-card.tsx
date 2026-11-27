import Image from "next/image"
import Link from "next/link"
import { formatSaleEnd } from "@/lib/catalog"
import { DEAL_CONDITION_LABELS } from "@/lib/deals"
import type { Deal } from "@/lib/deals-data"
import { isPrivateMediaUrl } from "@/lib/media"
import styles from "./deal-card.module.css"

function formatPrice(cents: number) {
  const digits = cents % 100 === 0 ? 0 : 2
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100)
}

/**
 * A QDeal or featured sale: title, summary, its products, and a closing
 * note. A featured sale also says when it ends. In portrait (the Sales
 * page's carousel), the image sits below the details, centered in the space
 * the card has left.
 */
export function DealCard({
  deal,
  showEnd = false,
  portrait = false,
  eager = false,
}: {
  deal: Deal
  showEnd?: boolean
  portrait?: boolean
  /** The image is likely the largest thing on screen. */
  eager?: boolean
}) {
  const titleId = `deal-${deal.id}`
  const image = deal.image
  return (
    <article
      className={styles.card}
      aria-labelledby={titleId}
      data-portrait={portrait || undefined}
    >
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {deal.title}
        </h2>
        {deal.summary ? <p className={styles.summary}>{deal.summary}</p> : null}
        {showEnd && deal.endsAt ? (
          <p className={styles.ends}>{formatSaleEnd(deal.endsAt)}</p>
        ) : null}
      </div>
      {image && !portrait && (
        <Image
          className={styles.poster}
          src={image.src}
          unoptimized={isPrivateMediaUrl(image.src)}
          crossOrigin="anonymous"
          alt={image.alt}
          width={image.width}
          height={image.height}
          sizes="(max-width: 760px) 90vw, 700px"
          loading={eager ? "eager" : undefined}
        />
      )}
      {deal.items.length > 0 ? (
        <ul className={styles.items}>
          {deal.items.map((item) => (
            // Spaces between the cells keep screen readers from running the
            // brand and name together; the grid ignores them.
            <li key={item.id} className={styles.item}>
              <span className={styles.brand}>{item.brand}</span>{" "}
              {item.href ? (
                <Link className={styles.name} href={item.href}>
                  {item.name}
                </Link>
              ) : (
                <span className={styles.name}>{item.name}</span>
              )}{" "}
              <span className={styles.meta}>
                {item.condition ? (
                  <span className={styles.condition}>
                    {DEAL_CONDITION_LABELS[item.condition]}
                  </span>
                ) : null}{" "}
                {item.priceCents !== null ? (
                  <span className={styles.price}>
                    {formatPrice(item.priceCents)}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {image && portrait && (
        <div className={styles.frame}>
          <Image
            src={image.src}
            unoptimized={isPrivateMediaUrl(image.src)}
            crossOrigin="anonymous"
            alt={image.alt}
            fill
            sizes="(max-width: 700px) 80vw, 360px"
            loading={eager ? "eager" : undefined}
          />
        </div>
      )}
      {deal.note ? <p className={styles.note}>{deal.note}</p> : null}
    </article>
  )
}
