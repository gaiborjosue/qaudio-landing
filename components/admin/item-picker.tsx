"use client"

import { useId, useState } from "react"
import { Pencil, Search, Trash2 } from "lucide-react"
import { byName } from "@/lib/admin/alphabetical"
import styles from "./admin.module.css"

export type PickerItem = {
  id: string
  title: string
  /** A short line under the title: status, date, price. */
  meta: string
  onEdit: () => void
  onRemove?: () => void
}

// Matching ignores case and accents, so "pro ject" or "anthem" find their
// items however they're typed.
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

/**
 * The Edit menu's list for one kind of item: a search field and each item,
 * A–Z unless `ordered`, with Edit and (where it can be removed) Remove.
 * Choosing one starts the chat about that exact item.
 */
export function ItemPicker({
  items,
  noun,
  ordered = false,
}: {
  items: PickerItem[]
  /** Singular, lower case: "product", "news post". */
  noun: string
  /** Keeps the given order, for items named by their dates. */
  ordered?: boolean
}) {
  const [query, setQuery] = useState("")
  const listId = useId()
  const words = fold(query).split(/\s+/).filter(Boolean)
  const listed = ordered
    ? items
    : items.toSorted((a, b) => byName(a.title, b.title))
  const shown = listed.filter((item) => {
    const text = fold(`${item.title} ${item.meta}`)
    return words.every((word) => text.includes(word))
  })

  return (
    <div className={styles.picker}>
      {items.length > 6 && (
        <label className={styles.pickerSearch}>
          <Search size={14} strokeWidth={2} aria-hidden="true" />
          <span className="visually-hidden">Find a {noun}</span>
          <input
            type="search"
            value={query}
            placeholder={`Find a ${noun}`}
            aria-controls={listId}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      )}
      <ul id={listId} className={styles.pickerList}>
        {shown.map((item) => (
          <li key={item.id}>
            <span className={styles.pickerText}>
              <span className={styles.pickerTitle}>{item.title}</span>
              {item.meta && (
                <span className={styles.pickerMeta}>{item.meta}</span>
              )}
            </span>
            <button
              type="button"
              aria-label={`Edit ${item.title}`}
              title="Edit"
              onClick={item.onEdit}
            >
              <Pencil size={14} strokeWidth={2} aria-hidden="true" />
            </button>
            {item.onRemove && (
              <button
                type="button"
                aria-label={`Remove ${item.title}`}
                title="Remove"
                onClick={item.onRemove}
              >
                <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className={styles.pickerEmpty} role="status">
          {items.length === 0 ? `No ${noun}s yet.` : "Nothing matches."}
        </p>
      )}
    </div>
  )
}
