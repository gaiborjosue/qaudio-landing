import Image from "next/image"
import type { Deal, DealItem } from "@/lib/deals-data"
import styles from "./deal-card.module.css"

const CONDITIONS: Record<NonNullable<DealItem["condition"]>, string> = {
  new: "New",
  demo: "Demo",
}

function formatPrice(cents: number) {
  const digits = cents % 100 === 0 ? 0 : 2
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(cents / 100)
}

/** A QDeal promotion: title, summary, its products, and a closing note. */
export function DealCard({ deal }: { deal: Deal }) {
  const titleId = `deal-${deal.id}`
  return (
    <article className={styles.card} aria-labelledby={titleId}>
      <div className={styles.head}>
        <h2 id={titleId} className={styles.title}>
          {deal.title}
        </h2>
        {deal.summary ? <p className={styles.summary}>{deal.summary}</p> : null}
      </div>
      {deal.image && (
        <Image
          className={styles.poster}
          src={deal.image.src}
          alt={deal.image.alt}
          width={deal.image.width}
          height={deal.image.height}
          sizes="(max-width: 760px) 90vw, 700px"
        />
      )}
      {deal.items.length > 0 ? (
        <ul className={styles.items}>
          {deal.items.map((item) => (
            // Spaces between the cells keep screen readers from running the
            // brand and name together; the grid ignores them.
            <li key={item.id} className={styles.item}>
              <span className={styles.brand}>{item.brand}</span>{" "}
              <span className={styles.name}>{item.name}</span>{" "}
              <span className={styles.meta}>
                {item.condition ? (
                  <span className={styles.condition}>
                    {CONDITIONS[item.condition]}
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
      {deal.note ? <p className={styles.note}>{deal.note}</p> : null}
    </article>
  )
}
