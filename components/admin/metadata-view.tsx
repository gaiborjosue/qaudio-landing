"use client"

import {
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowUpDown, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import {
  deleteMetadataFromAdmin,
  saveMetadataOrder,
} from "@/app/admin/metadata/actions"
import {
  NO_PRODUCT_FILTERS,
  productFiltersHref,
} from "@/lib/admin/product-filters"
import { catalogAssetUrl } from "@/lib/catalog-assets"
import type {
  MetadataData,
  MetadataKind,
  MetadataRow,
} from "@/lib/admin/metadata"
import type { AdminProduct } from "@/lib/admin/preview"
import { discardUpload } from "@/lib/admin/photo-upload"
import { SortableList } from "@/components/ui/sortable-list"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  MetadataEditor,
  metadataDraft,
  type MetadataDraft,
} from "./metadata-editor"
import admin from "./admin.module.css"
import { toast } from "./admin-toast"
import page from "./products-view.module.css"
import styles from "./metadata.module.css"

const KINDS: MetadataKind[] = ["categories", "brands"]
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
type Order = { expected: string[]; ordered: string[] }
type Editing = { kind: MetadataKind; key: string; slug?: string }

export function MetadataView({
  data,
  products,
  active,
  onProducts,
}: {
  data: MetadataData
  products: AdminProduct[]
  active: boolean
  onProducts: (facet: "category" | "brand", slug: string) => void
}) {
  const router = useRouter()
  const id = useId()
  const [kind, setKind] = useState<MetadataKind>("categories")
  const [filters, setFilters] = useState({ categories: "", brands: "" })
  const [drafts, setDrafts] = useState<Record<string, MetadataDraft>>({})
  const [editing, setEditing] = useState<Editing | null>(null)
  const [orders, setOrders] = useState<Partial<Record<MetadataKind, Order>>>({})
  const [deleting, setDeleting] = useState<{
    kind: MetadataKind
    row: MetadataRow
  } | null>(null)
  const [pending, startPending] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const rows = data[kind]
  const order = orders[kind]
  const counts = new Map<string, number>()
  for (const product of products) {
    const slug =
      kind === "categories" ? product.category.slug : product.brand?.slug
    if (!slug) continue
    counts.set(slug, (counts.get(slug) ?? 0) + 1)
  }
  const sortable = useMemo(
    () => rows.map((row) => ({ ...row, id: row.slug })),
    [rows]
  )
  const arranged = order
    ? order.ordered.flatMap(
        (slug) => sortable.find((row) => row.slug === slug) ?? []
      )
    : sortable
  const visible = rows.filter((row) =>
    fold(`${row.name} ${row.slug} ${row.wheel_label ?? ""}`).includes(
      fold(filters[kind])
    )
  )
  const singular = kind === "categories" ? "category" : "brand"
  const edit = (row?: MetadataRow) => {
    const key = `${kind}:${row?.slug ?? "new"}`
    setDrafts((current) => ({
      ...current,
      [key]: current[key] ?? metadataDraft(kind, row),
    }))
    setEditing({ kind, key, slug: row?.slug })
  }
  const forget = (key: string) =>
    setDrafts((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([name]) => name !== key)
      )
    )
  const refresh = (title: string, name?: string) => {
    toast("success", { title, description: name && `“${name}”` })
    router.refresh()
  }
  const target = deleting?.row
  return (
    <div className={page.page}>
      <div className={page.head}>
        <h2>Metadata</h2>
        <button
          ref={newButton}
          type="button"
          className={`${admin.primary} ${page.new}`}
          onClick={() => edit()}
          disabled={pending || !!order}
        >
          <Plus size={16} aria-hidden="true" />
          New {singular}
        </button>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Metadata">
          {KINDS.map((item, index) => (
            <button
              key={item}
              ref={(node) => {
                tabs.current[index] = node
              }}
              type="button"
              role="tab"
              id={`${id}-${item}`}
              aria-selected={kind === item}
              aria-controls={`${id}-panel`}
              tabIndex={kind === item ? 0 : -1}
              onClick={() => {
                setKind(item)
                setError(null)
              }}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key
                  )
                )
                  return
                event.preventDefault()
                const to =
                  event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index
                setKind(KINDS[to])
                setError(null)
                tabs.current[to]?.focus()
              }}
            >
              {item === "categories" ? "Categories" : "Brands"}
            </button>
          ))}
        </div>
        {!order && (
          <label className={styles.search}>
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search {kind}</span>
            <input
              type="search"
              placeholder={`Search ${kind}…`}
              value={filters[kind]}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  [kind]: event.target.value,
                }))
              }
            />
          </label>
        )}
        {!order && (
          <button
            type="button"
            className={admin.secondary}
            disabled={pending || rows.length < 2}
            onClick={() => {
              const slugs = rows.map((row) => row.slug)
              setOrders((current) => ({
                ...current,
                [kind]: { expected: slugs, ordered: slugs },
              }))
              setError(null)
            }}
          >
            <ArrowUpDown size={15} aria-hidden="true" />
            Reorder
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${kind}`}>
        {order ? (
          <>
            <fieldset disabled={pending} className={styles.orderList}>
              <SortableList
                items={arranged}
                onReorder={(items) => {
                  if (!pending)
                    setOrders((current) => ({
                      ...current,
                      [kind]: {
                        ...order,
                        ordered: items.map((item) => item.slug),
                      },
                    }))
                }}
                itemLabel={(row) => row.name}
                aria-label={`Order ${kind}`}
                renderItem={(row) => (
                  <span className={styles.orderName}>{row.name}</span>
                )}
              />
            </fieldset>
            <div className={styles.orderActions}>
              <button
                type="button"
                className={admin.secondary}
                disabled={pending}
                onClick={() => {
                  setOrders((current) => ({ ...current, [kind]: undefined }))
                  setError(null)
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className={admin.primary}
                disabled={
                  pending ||
                  order.expected.join("|") === order.ordered.join("|")
                }
                onClick={() => {
                  setError(null)
                  startPending(async () => {
                    try {
                      const result = await saveMetadataOrder({ kind, ...order })
                      if ("error" in result) {
                        setError(result.error)
                        return
                      }
                      setOrders((current) => ({
                        ...current,
                        [kind]: undefined,
                      }))
                      refresh("Order saved")
                    } catch {
                      setError("Couldn’t save the order. Try again.")
                    }
                  })
                }}
              >
                {pending ? "Saving…" : "Save order"}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.tableFrame}>
            <table className={styles.table}>
              <caption className="sr-only">
                {kind === "categories" ? "Categories" : "Brands"}, in display
                order
              </caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{kind === "categories" ? "Icon" : "Logo"}</th>
                  <th scope="col">Name / address</th>
                  {kind === "categories" && (
                    <>
                      <th scope="col">Wheel label</th>
                      <th scope="col">Background</th>
                    </>
                  )}
                  <th scope="col">Products</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const used = counts.get(row.slug) ?? 0
                  const required =
                    kind === "categories" && row.slug === "used-equipment"
                  const image = row.logo_path ?? row.artwork_path
                  return (
                    <tr key={row.slug}>
                      <td>{rows.indexOf(row) + 1}</td>
                      <td>
                        {image && (
                          <div
                            className={
                              kind === "brands"
                                ? styles.logoThumb
                                : styles.thumb
                            }
                          >
                            <Image
                              src={catalogAssetUrl(image)}
                              alt=""
                              fill
                              sizes="64px"
                            />
                          </div>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={styles.name}
                          onClick={() => edit(row)}
                        >
                          {row.name}
                        </button>
                        <span className={styles.slug}>
                          {row.slug}
                          {required ? " · Required" : ""}
                        </span>
                      </td>
                      {kind === "categories" && (
                        <>
                          <td>{row.wheel_label}</td>
                          <td>
                            {row.scene_path && (
                              <div className={styles.sceneThumb}>
                                <Image
                                  src={catalogAssetUrl(row.scene_path)}
                                  alt=""
                                  fill
                                  sizes="80px"
                                />
                              </div>
                            )}
                          </td>
                        </>
                      )}
                      <td>
                        <a
                          href={productFiltersHref({
                            ...NO_PRODUCT_FILTERS,
                            [singular]: row.slug,
                          })}
                          className={styles.productCount}
                          aria-label={`Show ${used} products for ${row.name}`}
                          onClick={(event) => {
                            if (
                              event.button !== 0 ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey ||
                              event.altKey
                            )
                              return
                            event.preventDefault()
                            onProducts(singular, row.slug)
                          }}
                        >
                          {used}
                        </a>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <button
                            type="button"
                            className={admin.iconButton}
                            aria-label={`Edit ${row.name}`}
                            onClick={() => edit(row)}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            className={admin.iconButton}
                            aria-label={`Delete ${row.name}${required ? ": required by navigation" : used ? `: used by ${used} products` : ""}`}
                            title={
                              required
                                ? "Required by navigation"
                                : used
                                  ? "Reassign its products first"
                                  : "Delete"
                            }
                            disabled={!!used || required || pending}
                            onClick={() => {
                              setError(null)
                              setDeleting({ kind, row })
                            }}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {visible.length === 0 && (
                  <tr>
                    <td
                      colSpan={kind === "categories" ? 7 : 5}
                      className={styles.empty}
                    >
                      No {kind} found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Sheet
        open={active && !!editing}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className={`${page.sheet} ${styles.sheet}`}
          overlayClassName={page.overlay}
        >
          <div className={page.sheetHeader}>
            <SheetTitle className={page.sheetTitle}>
              {editing?.slug
                ? drafts[editing.key]?.name
                : `New ${editing?.kind === "categories" ? "category" : "brand"}`}
            </SheetTitle>
            <SheetClose className={page.close} aria-label="Close">
              <X size={18} aria-hidden="true" />
            </SheetClose>
          </div>
          {editing && drafts[editing.key] && (
            <MetadataEditor
              key={editing.key}
              draft={drafts[editing.key]}
              onChange={(change) =>
                setDrafts((current) => ({
                  ...current,
                  [editing.key]:
                    typeof change === "function"
                      ? change(current[editing.key])
                      : change,
                }))
              }
              onSaved={() => {
                const name = drafts[editing.key].name
                forget(editing.key)
                setEditing(null)
                refresh("Saved", name)
              }}
              onDiscard={() => {
                const draft = drafts[editing.key]
                for (const path of [
                  draft.artwork_path,
                  draft.scene_path,
                  draft.logo_path,
                ])
                  if (path.startsWith("uploads/"))
                    void discardUpload(path).catch(() => {})
                forget(editing.key)
                setEditing(null)
              }}
            />
          )}
        </SheetContent>
      </Sheet>
      <AlertDialog
        open={active && !!deleting}
        onOpenChange={(open) => !open && !pending && setDeleting(null)}
      >
        <AlertDialogContent
          className={page.confirm}
          finalFocus={() => newButton.current}
        >
          <AlertDialogHeader className={page.confirmHeader}>
            <AlertDialogTitle className={page.confirmTitle}>
              Delete “{target?.name}”?
            </AlertDialogTitle>
            <AlertDialogDescription className={page.confirmText}>
              This removes it from the site. Only entries with no assigned
              products can be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}
          <AlertDialogFooter className={page.confirmActions}>
            <AlertDialogCancel
              disabled={pending}
              render={<button type="button" className={admin.secondary} />}
            >
              Cancel
            </AlertDialogCancel>
            <button
              type="button"
              className={admin.primary}
              disabled={pending}
              onClick={() => {
                if (!deleting) return
                setError(null)
                startPending(async () => {
                  try {
                    const result = await deleteMetadataFromAdmin({
                      kind: deleting.kind,
                      slug: deleting.row.slug,
                    })
                    if ("error" in result) {
                      setError(result.error)
                      return
                    }
                    forget(`${deleting.kind}:${deleting.row.slug}`)
                    setDeleting(null)
                    refresh("Deleted", deleting.row.name)
                  } catch {
                    setError("Couldn’t delete this entry. Try again.")
                  }
                })
              }}
            >
              {pending ? "Deleting…" : "Delete"}
            </button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
