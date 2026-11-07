"use client"

import { useId, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ChevronLeft, ChevronRight, Pencil, Search, Trash2 } from "lucide-react"
import { saveProductTableEdits } from "@/app/admin/actions"
import { GridBeam, type GridBeamLines } from "@/components/ui/grid-beam"
import type { AdminProduct, CatalogTaxonomy } from "@/lib/admin/preview"
import {
  NO_PRODUCT_FILTERS,
  type ProductFilters,
} from "@/lib/admin/product-filters"
import { parseDollars } from "@/lib/admin/product-editor"
import { saleStatus } from "@/lib/admin/sale"
import type { ProductQuickEdit } from "@/lib/admin/schemas"
import { toStoreDateTime } from "@/lib/admin/store-time"
import { Choice } from "./choice"
import adminStyles from "./admin.module.css"
import styles from "./product-table.module.css"

const PAGE_SIZE = 20

const CONDITIONS = ["New", "Demo", "Used"] as const
// In the shop's condition-badge colors (Choice carries them).
const CONDITION_OPTIONS = CONDITIONS.map((condition) => ({
  value: condition,
  label: condition,
  tone: condition.toLowerCase(),
}))
const ALL = "all"
const STATUSES = [
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
] as const

type Condition = (typeof CONDITIONS)[number]
type Status = (typeof STATUSES)[number]["value"]

/** A product's unsaved values, the price as typed. */
type Draft = {
  price?: string
  condition?: Condition
  ready_for_audition?: boolean
  status?: Status
}
type Drafts = Record<string, Draft>

// Matching ignores case and accents, like the Edit menu's lists.
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

/** 129950 → "1,299.50": the price field's text before it's edited. */
const dollars = (cents: number | null) =>
  cents === null
    ? ""
    : (cents / 100).toLocaleString("en-US", {
        minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      })

const isPrice = (cents: number) => Number.isSafeInteger(cents) && cents > 0

/** The draft's fields that differ from the saved product. */
function unsaved(product: AdminProduct, draft: Draft = {}): Draft {
  const { price, condition, ready_for_audition, status } = draft
  return {
    ...(price !== undefined &&
      parseDollars(price) !== product.price_cents && { price }),
    ...(condition !== undefined &&
      condition !== product.condition && { condition }),
    ...(ready_for_audition !== undefined &&
      ready_for_audition !== product.ready_for_audition && {
        ready_for_audition,
      }),
    ...(status !== undefined && status !== product.status && { status }),
  }
}

/** The drafts left once the ones sent to Save are saved. */
function withoutSaved(current: Drafts, sent: Drafts): Drafts {
  const next: Drafts = {}
  for (const [id, draft] of Object.entries(current)) {
    const left = Object.fromEntries(
      Object.entries(draft).filter(
        ([field, value]) => sent[id]?.[field as keyof Draft] !== value
      )
    ) as Draft
    if (Object.keys(left).length > 0) next[id] = left
  }
  return next
}

/**
 * The beams follow the table's own lines: between the columns, and under
 * the heading and each row but the last.
 */
function tableLines(root: HTMLElement, box: DOMRect): GridBeamLines {
  const table = root.querySelector("table")
  const head = table?.tHead?.rows[0]
  if (!table || !head) return { x: [], y: [] }
  return {
    x: [...head.cells]
      .slice(1)
      .map((cell) => cell.getBoundingClientRect().left - box.left),
    y: [...table.rows]
      .slice(0, -1)
      .map((row) => row.getBoundingClientRect().bottom - box.top),
  }
}

/**
 * Every product, drafts included, as a table the owner filters and edits in
 * place, like a CMS collection. The short fields (price, condition,
 * audition, status) save here in one go, as the signed-in admin; a row's
 * name or pencil opens the full product form, and its bin deletes it.
 * Unsaved changes are kept by product id, so they survive paging and
 * filtering until Save or Discard.
 */
export function ProductTable({
  products,
  taxonomy,
  filters,
  onFilters,
  beam,
  onOpen,
  onDelete,
  onSaved,
}: {
  /** Every product, in shop order. */
  products: AdminProduct[]
  taxonomy: CatalogTaxonomy
  filters: ProductFilters
  onFilters: (filters: ProductFilters) => void
  /** Runs the grid beam over the table (off while it isn't shown). */
  beam: boolean
  /** Opens a product in the full form. */
  onOpen: (product: AdminProduct) => void
  /** Asks to delete a product. */
  onDelete: (product: AdminProduct) => void
  /** After a save; names are the edited products', in the edits' order. */
  onSaved: (names: string[]) => void
}) {
  const router = useRouter()
  const id = useId()
  const [page, setPage] = useState(1)
  const [previousFilters, setPreviousFilters] = useState(filters)
  if (filters !== previousFilters) {
    setPreviousFilters(filters)
    setPage(1)
  }
  const [drafts, setDrafts] = useState<Drafts>({})
  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)

  const setFilter = (key: keyof ProductFilters, value: string) => {
    onFilters({ ...filters, [key]: value })
    setPage(1)
  }
  const filtered = Object.values(filters).some(Boolean)

  // Rows filter on their saved values, so a row doesn't vanish while it's
  // being changed.
  const words = fold(filters.search).split(/\s+/).filter(Boolean)
  const shown = products.filter((product) => {
    if (filters.category && product.category.slug !== filters.category) {
      return false
    }
    if (filters.brand && product.brand?.slug !== filters.brand) return false
    if (filters.condition && product.condition !== filters.condition) {
      return false
    }
    if (filters.status && product.status !== filters.status) return false
    const text = fold(
      `${product.name} ${product.brand?.name ?? ""} ${product.category.name}`
    )
    return words.every((word) => text.includes(word))
  })
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const rows = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const changes = products.flatMap((product) => {
    const fields = unsaved(product, drafts[product.id])
    return Object.keys(fields).length > 0 ? [{ product, fields }] : []
  })
  const unpriced = changes.filter(
    ({ fields }) =>
      fields.price !== undefined && !isPrice(parseDollars(fields.price))
  )

  // A typed price stays as typed until the field loses focus, even when it
  // matches the saved one, so "1,299.5" can be on its way to "1,299.55".
  const edit = (product: AdminProduct, change: Draft, typing = false) =>
    setDrafts((all) => {
      const draft = { ...all[product.id], ...change }
      const fields = unsaved(product, draft)
      if (typing && draft.price !== undefined) fields.price = draft.price
      const next = { ...all }
      if (Object.keys(fields).length > 0) next[product.id] = fields
      else delete next[product.id]
      return next
    })

  const save = () => {
    const edits: ProductQuickEdit[] = changes.map(({ product, fields }) => ({
      id: product.id,
      ...(fields.price !== undefined && {
        price_cents: parseDollars(fields.price),
      }),
      ...(fields.condition && { condition: fields.condition }),
      ...(fields.ready_for_audition !== undefined && {
        ready_for_audition: fields.ready_for_audition,
      }),
      ...(fields.status && { status: fields.status }),
    }))
    const names = changes.map(({ product }) => product.name)
    const sent = drafts
    setSaveError(null)
    startSaving(async () => {
      const result = await saveProductTableEdits(edits)
      if ("error" in result) {
        setSaveError(result.error)
        return
      }
      // Clearing with the refresh shows the saved values without a flash
      // of the old ones; anything typed meanwhile stays.
      startSaving(() => {
        setDrafts((all) => withoutSaved(all, sent))
        router.refresh()
      })
      onSaved(names)
    })
  }

  const discard = () => {
    setDrafts({})
    setSaveError(null)
  }

  const facets: {
    key: Exclude<keyof ProductFilters, "search">
    label: string
    all: string
    options: readonly { value: string; label: string }[]
  }[] = [
    {
      key: "category",
      label: "Category",
      all: "All categories",
      options: taxonomy.categories.map(({ slug, name }) => ({
        value: slug,
        label: name,
      })),
    },
    {
      key: "brand",
      label: "Brand",
      all: "All brands",
      options: taxonomy.brands.map(({ slug, name }) => ({
        value: slug,
        label: name,
      })),
    },
    {
      key: "condition",
      label: "Condition",
      all: "Any condition",
      options: CONDITION_OPTIONS,
    },
    { key: "status", label: "Status", all: "Any status", options: STATUSES },
  ]

  const changedId = `${id}-changed`
  const regionId = `${id}-products`

  return (
    <div className={styles.productTable}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Search size={14} strokeWidth={2} aria-hidden="true" />
          <span className="visually-hidden">Search products</span>
          <input
            type="search"
            value={filters.search}
            placeholder="Search"
            aria-controls={regionId}
            onChange={(event) => setFilter("search", event.target.value)}
          />
        </label>
        {facets.map((facet) => (
          <div key={facet.key} className={styles.facet}>
            {/* "all" stands for no filter: the select needs a value. */}
            <Choice
              small
              value={filters[facet.key] || ALL}
              options={[{ value: ALL, label: facet.all }, ...facet.options]}
              onChange={(value) =>
                setFilter(facet.key, value === ALL ? "" : value)
              }
              aria-label={facet.label}
            />
          </div>
        ))}
        {filtered && (
          <button
            type="button"
            className={adminStyles.quiet}
            onClick={() => {
              onFilters(NO_PRODUCT_FILTERS)
              setPage(1)
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div id={regionId} className={styles.region}>
        {rows.length > 0 && (
          <div className={styles.frame}>
            <div className={styles.scroller}>
              <GridBeam
                className={styles.beam}
                lines={tableLines}
                active={beam}
              >
                <table className={styles.table}>
                  <caption className="visually-hidden">Products</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={styles.photoColumn}>
                        <span className="visually-hidden">Photo</span>
                      </th>
                      <th scope="col">Product</th>
                      <th scope="col">Category</th>
                      <th scope="col">Condition</th>
                      <th scope="col">Price</th>
                      <th scope="col" className={styles.auditionColumn}>
                        Audition
                      </th>
                      <th scope="col">Status</th>
                      <th scope="col" className={styles.actionsColumn}>
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((product) => (
                      <ProductRow
                        key={product.id}
                        product={product}
                        draft={drafts[product.id] ?? {}}
                        errorId={`${id}-${product.id}-price`}
                        changedId={changedId}
                        onEdit={(change, typing) =>
                          edit(product, change, typing)
                        }
                        onOpen={() => onOpen(product)}
                        onDelete={() => onDelete(product)}
                      />
                    ))}
                  </tbody>
                </table>
              </GridBeam>
            </div>
          </div>
        )}
        <span id={changedId} hidden>
          Changed
        </span>

        <div className={styles.pager}>
          <p className={styles.count} role="status">
            {shown.length > 0
              ? filtered
                ? `${plural(shown.length, "product")} of ${products.length}`
                : plural(shown.length, "product")
              : products.length > 0
                ? "No products match."
                : "No products yet."}
          </p>
          {pageCount > 1 && (
            <div className={styles.pages}>
              <span aria-live="polite">
                Page {current} of {pageCount}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Previous page"
                aria-disabled={current === 1}
                onClick={() => current > 1 && setPage(current - 1)}
              >
                <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                aria-label="Next page"
                aria-disabled={current === pageCount}
                onClick={() => current < pageCount && setPage(current + 1)}
              >
                <ChevronRight size={16} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </div>

      {changes.length > 0 && (
        <div className={styles.footer}>
          <p className={styles.changed}>
            {plural(changes.length, "product")} changed
          </p>
          <div className={styles.footerActions}>
            <button
              type="button"
              className={adminStyles.primary}
              disabled={saving || unpriced.length > 0}
              onClick={save}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              className={adminStyles.secondary}
              disabled={saving}
              onClick={discard}
            >
              Discard
            </button>
          </div>
          {unpriced.length > 0 && (
            <p className={`${adminStyles.hint} ${styles.note}`}>
              Enter a price for{" "}
              {unpriced.map(({ product }) => product.name).join(", ")}.
            </p>
          )}
          {saveError && (
            <p className={styles.alert} role="alert">
              {saveError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ProductRow({
  product,
  draft,
  errorId,
  changedId,
  onEdit,
  onOpen,
  onDelete,
}: {
  product: AdminProduct
  draft: Draft
  errorId: string
  changedId: string
  onEdit: (change: Draft, typing?: boolean) => void
  onOpen: () => void
  onDelete: () => void
}) {
  const fields = unsaved(product, draft)
  // A changed cell shows a dot and bold text, and says "Changed" to
  // assistive technology.
  const mark = (field: keyof Draft) => fields[field] !== undefined || undefined
  const changed = (field: keyof Draft) => (mark(field) ? changedId : undefined)
  const photo = product.images[0]
  const price = draft.price ?? dollars(product.price_cents)
  const priceInvalid = mark("price") && !isPrice(parseDollars(price))
  const pair = product.price_unit === "pair"

  return (
    <tr>
      <td>
        {photo ? (
          <Image
            className={styles.photo}
            src={photo.src}
            alt=""
            width={40}
            height={40}
            sizes="40px"
          />
        ) : (
          <span className={styles.photo} />
        )}
      </td>
      <th scope="row" className={styles.product}>
        <button type="button" className={styles.name} onClick={onOpen}>
          {product.name}
        </button>
        <span className={styles.brand}>{product.brand?.name ?? ""}</span>
      </th>
      <td className={styles.category}>{product.category.name}</td>
      <td>
        <span className={styles.cell} data-changed={mark("condition")}>
          <Choice
            small
            value={draft.condition ?? product.condition}
            options={CONDITION_OPTIONS}
            aria-label={`Condition of ${product.name}`}
            aria-describedby={changed("condition")}
            onChange={(value) => onEdit({ condition: value as Condition })}
          />
        </span>
      </td>
      <td>
        <span className={styles.cell} data-changed={mark("price")}>
          <span className={styles.price}>
            <span aria-hidden="true">$</span>
            <input
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={price}
              aria-label={`Price of ${product.name}${pair ? ", per pair" : ""}`}
              aria-invalid={priceInvalid || undefined}
              aria-describedby={
                [priceInvalid && errorId, changed("price")]
                  .filter(Boolean)
                  .join(" ") || undefined
              }
              onChange={(event) => onEdit({ price: event.target.value }, true)}
              onBlur={() => draft.price !== undefined && onEdit({})}
            />
          </span>
          {pair && <span className={styles.unit}>/pair</span>}
        </span>
        {priceInvalid && (
          <span id={errorId} className={styles.problem}>
            Enter a price
          </span>
        )}
        {/* The regular price is edited here; a sale, in the product's form. */}
        {product.sale_window && (
          <span className={styles.sale}>
            {saleStatus(product.sale_window, toStoreDateTime(new Date()))}
          </span>
        )}
      </td>
      <td className={styles.auditionColumn}>
        <span className={styles.cell} data-changed={mark("ready_for_audition")}>
          <input
            type="checkbox"
            checked={draft.ready_for_audition ?? product.ready_for_audition}
            aria-label={`${product.name} ready for audition`}
            aria-describedby={changed("ready_for_audition")}
            onChange={(event) =>
              onEdit({ ready_for_audition: event.target.checked })
            }
          />
        </span>
      </td>
      <td>
        <span className={styles.cell} data-changed={mark("status")}>
          <Choice
            small
            value={draft.status ?? product.status}
            options={STATUSES}
            aria-label={`Status of ${product.name}`}
            aria-describedby={changed("status")}
            onChange={(value) => onEdit({ status: value as Status })}
          />
        </span>
      </td>
      <td className={styles.actionsColumn}>
        <span className={styles.rowActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Edit ${product.name}`}
            title="Edit"
            onClick={onOpen}
          >
            <Pencil size={15} strokeWidth={2} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={`Delete ${product.name}`}
            title="Delete"
            onClick={onDelete}
          >
            <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
          </button>
        </span>
      </td>
    </tr>
  )
}
