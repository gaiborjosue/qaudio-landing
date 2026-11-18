import type { ReactNode } from "react"
import Image from "next/image"
import catalogStyles from "@/components/product-catalog.module.css"
import { isPrivateMediaUrl } from "@/lib/media"
import styles from "./product-table.module.css"

const CONDITION_TONES = ["new", "demo", "used"]

/** A product's photo at the table's 40px, or an empty tile. Photos still
 * in the chat's private uploads load straight from the admin's media route. */
export function ProductThumb({
  src,
  alt = "",
}: {
  src?: string
  alt?: string
}) {
  return src ? (
    <Image
      className={styles.photo}
      src={src}
      alt={alt}
      title={alt || undefined}
      width={40}
      height={40}
      sizes="40px"
      unoptimized={isPrivateMediaUrl(src)}
      crossOrigin="anonymous"
    />
  ) : (
    <span className={styles.photo} />
  )
}

/** A condition as the shop's badge (green New, blue Demo, amber Used). */
export function ConditionBadge({ condition }: { condition: string }) {
  const tone = condition.trim().toLowerCase()
  return (
    <span
      className={catalogStyles.condition}
      data-tone={CONDITION_TONES.includes(tone) ? tone : "other"}
    >
      {condition}
    </span>
  )
}

/** What the product column shows for a row. */
export type ReviewProduct = {
  name: string
  photo?: string
  /** Under the name: brand, draft, and the like. */
  detail?: string
  /** Why this row's change can't be made. */
  problem?: string | null
}

export type ReviewColumn<T> = {
  label: string
  /** Right-aligned figures. */
  numeric?: boolean
  /** Room for a line of text or photos. */
  wide?: boolean
  cell: (row: T) => ReactNode
}

/**
 * Proposed product changes as a read-only table, in the Products tab's
 * frame and type, so many products stay easy to review in a chat card. The
 * photo and product columns lead; `columns` follow. Long lists scroll
 * inside the frame under a sticky heading.
 */
export function ProductReviewTable<T>({
  label,
  rows,
  rowKey,
  product,
  columns,
  numbered = false,
}: {
  /** The table's accessible name. */
  label: string
  rows: T[]
  rowKey: (row: T) => string
  product: (row: T) => ReviewProduct
  columns: ReviewColumn<T>[]
  /** Leads with each row's place, for an order. */
  numbered?: boolean
}) {
  return (
    <div className={`${styles.frame} ${styles.review}`}>
      <div
        className={styles.scroller}
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        <table className={styles.table}>
          <caption className="visually-hidden">{label}</caption>
          <thead>
            <tr>
              {numbered && (
                <th scope="col" className={styles.indexColumn}>
                  #
                </th>
              )}
              <th scope="col" className={styles.photoColumn}>
                <span className="visually-hidden">Photo</span>
              </th>
              <th scope="col">Product</th>
              {columns.map((column) => (
                <th
                  key={column.label}
                  scope="col"
                  data-numeric={column.numeric || undefined}
                  data-wide={column.wide || undefined}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const { name, photo, detail, problem } = product(row)
              return (
                <tr key={rowKey(row)}>
                  {numbered && (
                    <td className={styles.indexColumn}>{index + 1}</td>
                  )}
                  <td>
                    <ProductThumb src={photo} />
                  </td>
                  <th scope="row" className={styles.product}>
                    <span className={styles.name}>{name}</span>
                    {detail && <span className={styles.brand}>{detail}</span>}
                    {problem && (
                      <span className={styles.problem}>{problem}</span>
                    )}
                  </th>
                  {columns.map((column) => (
                    <td
                      key={column.label}
                      data-numeric={column.numeric || undefined}
                      data-wide={column.wide || undefined}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
