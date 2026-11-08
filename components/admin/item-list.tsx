"use client"

import { memo } from "react"
import type { EveToolPart } from "eve/react"
import { ProductThumb } from "@/components/admin/product-review-table"
import type { AdminProduct } from "@/lib/admin/preview"
import {
  productSlug,
  showListInputSchema,
  type ListItem,
} from "@/lib/admin/show-list"
import styles from "./item-list.module.css"

function Row({ item, photo }: { item: ListItem; photo?: string | null }) {
  return (
    <li className={styles.row}>
      {photo !== undefined && <ProductThumb src={photo ?? undefined} />}
      <div className={styles.text}>
        {item.href ? (
          <a
            className={styles.title}
            href={item.href}
            target="_blank"
            rel="noreferrer"
          >
            {item.title}
          </a>
        ) : (
          <span className={styles.title}>{item.title}</span>
        )}
        {item.detail && <span className={styles.detail}>{item.detail}</span>}
        {item.tags && item.tags.length > 0 && (
          <span className={styles.tags}>
            {item.tags.map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
          </span>
        )}
      </div>
      {(item.value || item.was) && (
        <span className={styles.figure}>
          {item.was && (
            <s className={styles.was}>
              <span className={styles.srOnly}>Was </span>
              {item.was}
            </s>
          )}
          {item.value && <span className={styles.value}>{item.value}</span>}
        </span>
      )}
    </li>
  )
}

/**
 * show_list's rows (the agent's generative UI): placeholders while the call
 * streams in, then its validated input. A call left open after the agent
 * stopped (an interrupted turn) shows nothing rather than placeholders that
 * never fill. Product links add the product's first photo from the data the
 * chat already has.
 */
export const ItemList = memo(function ItemList({
  part,
  live,
  products,
}: {
  part: EveToolPart
  /** The agent is still working on this message. */
  live: boolean
  products: AdminProduct[]
}) {
  if (part.state === "streaming") {
    if (!live) return null
    return (
      <div className={styles.list} aria-hidden="true">
        {[0, 1, 2].map((row) => (
          <div key={row} className={styles.placeholder} />
        ))}
      </div>
    )
  }
  const parsed = showListInputSchema.safeParse(part.input)
  if (!parsed.success) return null
  const { title, items } = parsed.data
  const photos = items.map((item) => {
    const slug = productSlug(item.href)
    const product = slug && products.find((entry) => entry.slug === slug)
    return product ? (product.images[0]?.src ?? null) : undefined
  })
  // A column of photos lines up only if every row has a tile.
  const withPhotos = photos.some((photo) => photo !== undefined)
  return (
    <section className={styles.list} aria-label={title ?? "List"}>
      {title && <h3 className={styles.heading}>{title}</h3>}
      <ul className={styles.rows}>
        {items.map((item, index) => (
          <Row
            key={index}
            item={item}
            photo={withPhotos ? (photos[index] ?? null) : undefined}
          />
        ))}
      </ul>
    </section>
  )
})
