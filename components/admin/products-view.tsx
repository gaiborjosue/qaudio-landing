"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Plus, X } from "lucide-react"
import { deleteProductFromAdmin } from "@/app/admin/actions"
import { ProductEditor } from "@/components/admin/product-editor"
import { ProductTable } from "@/components/admin/product-table"
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
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet"
import type { AdminProduct, CatalogTaxonomy } from "@/lib/admin/preview"
import { valuesFrom, valuesFromProduct } from "@/lib/admin/product-editor"
import adminStyles from "./admin.module.css"
import styles from "./products-view.module.css"

/** The product the sheet shows: a new one, or a saved one by id. */
export type ProductSheet = { mode: "new" } | { mode: "edit"; id: string }
/** What the chat's quick menus can ask the Products tab to open. */
export type ProductRequest = ProductSheet | { mode: "delete"; id: string }

// The form's unsaved work, per product, kept across closing the sheet.
const storageKey = (id?: string) => `qaudio:products:${id ?? "new"}`

/** What the sheet shows: a new product, or a saved one. */
type Shown = { mode: "new" } | { mode: "edit"; product: AdminProduct }
const NEW_SHEET: Shown = { mode: "new" }

/**
 * The admin's Products tab, like a CMS collection: every product in a
 * filterable table, with New product, a sheet holding the full product form
 * for adding or editing one, and Delete with a confirmation. Everything
 * saves directly as the signed-in admin, without the chat. The sheet and
 * the delete confirmation are controlled by the admin shell, so the chat's
 * quick menus can open them.
 */
export function ProductsView({
  products,
  taxonomy,
  active,
  sheet,
  onSheet,
  deleting,
  onDeleting,
}: {
  products: AdminProduct[]
  taxonomy: CatalogTaxonomy
  /** Whether this tab is the one shown. */
  active: boolean
  sheet: ProductSheet | null
  onSheet: (sheet: ProductSheet | null) => void
  /** The id of the product waiting for delete confirmation. */
  deleting: string | null
  onDeleting: (id: string | null) => void
}) {
  const router = useRouter()
  const [notice, setNotice] = useState<string | null>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const [removing, startRemoving] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // Set when the product the sheet or confirmation came from is gone, so
  // focus goes to New product instead of a row that no longer exists.
  const gone = useRef(false)

  // The sheet and the confirmation keep showing their product while they
  // close, even once it's deleted.
  const find = (id: string) => products.find((product) => product.id === id)
  const liveEditing = sheet?.mode === "edit" ? find(sheet.id) : undefined
  const liveSheet: Shown | null =
    sheet?.mode === "new"
      ? NEW_SHEET
      : liveEditing
        ? { mode: "edit", product: liveEditing }
        : null
  const [shown, setShown] = useState<Shown | null>(liveSheet)
  if (
    liveSheet &&
    (liveSheet.mode !== shown?.mode ||
      (shown.mode === "edit" && liveEditing !== shown.product))
  ) {
    setShown(liveSheet)
  }
  const editing = shown?.mode === "edit" ? shown.product : undefined
  const liveTarget = deleting ? find(deleting) : undefined
  const [target, setTarget] = useState(liveTarget)
  if (liveTarget && liveTarget !== target) setTarget(liveTarget)

  // A notice reads for a few seconds, then clears.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  const finalFocus = () => (gone.current ? newButton.current : true)

  const confirmDelete = () => {
    if (!target) return
    setDeleteError(null)
    startRemoving(async () => {
      const result = await deleteProductFromAdmin({
        id: target.id,
        name: target.name,
      })
      if ("error" in result) {
        setDeleteError(result.error)
        return
      }
      window.sessionStorage.removeItem(storageKey(target.id))
      gone.current = true
      startRemoving(() => {
        onDeleting(null)
        if (sheet?.mode === "edit" && sheet.id === target.id) onSheet(null)
        router.refresh()
      })
      setNotice(`Deleted “${target.name}”.`)
    })
  }

  const drafts = products.filter((product) => product.status !== "published")
  const sheetOpen = liveSheet !== null

  // Opened from the sheet, the confirmation nests inside it, so pressing it
  // doesn't count as pressing outside the sheet.
  const confirmation = (
    <AlertDialog
      open={!!liveTarget}
      onOpenChange={(open) => !open && !removing && onDeleting(null)}
    >
      <AlertDialogContent className={styles.confirm} finalFocus={finalFocus}>
        <AlertDialogHeader className={styles.confirmHeader}>
          <AlertDialogTitle className={styles.confirmTitle}>
            Delete “{target?.name}”?
          </AlertDialogTitle>
          <AlertDialogDescription className={styles.confirmText}>
            It comes out of the shop for good. To hide it but keep it, set it to
            Draft instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && (
          <p className={adminStyles.error} role="alert">
            {deleteError}
          </p>
        )}
        <AlertDialogFooter className={styles.confirmActions}>
          <AlertDialogCancel
            disabled={removing}
            render={<button type="button" className={adminStyles.secondary} />}
          >
            Cancel
          </AlertDialogCancel>
          <button
            type="button"
            className={adminStyles.primary}
            disabled={removing}
            onClick={confirmDelete}
          >
            {removing ? "Deleting…" : "Delete"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h2>Products</h2>
        <p className={styles.total}>
          {products.length} product{products.length === 1 ? "" : "s"}
          {drafts.length > 0 &&
            ` · ${drafts.length} draft${drafts.length === 1 ? "" : "s"}`}
        </p>
        <p className={styles.notice} role="status">
          {notice}
        </p>
        <button
          ref={newButton}
          type="button"
          className={`${adminStyles.primary} ${styles.new}`}
          onClick={() => {
            gone.current = false
            onSheet({ mode: "new" })
          }}
        >
          <Plus size={16} strokeWidth={2} aria-hidden="true" />
          New product
        </button>
      </div>

      <ProductTable
        products={products}
        taxonomy={taxonomy}
        beam={active && !sheet && !deleting}
        onOpen={(product) => {
          gone.current = false
          onSheet({ mode: "edit", id: product.id })
        }}
        onDelete={(product) => {
          gone.current = false
          setDeleteError(null)
          onDeleting(product.id)
        }}
        onSaved={(names) =>
          setNotice(
            names.length === 1
              ? `Saved “${names[0]}”.`
              : `Saved ${names.length} products.`
          )
        }
      />

      <Sheet open={sheetOpen} onOpenChange={(open) => !open && onSheet(null)}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className={styles.sheet}
          overlayClassName={styles.overlay}
          finalFocus={finalFocus}
        >
          <div className={styles.sheetHeader}>
            <SheetTitle className={styles.sheetTitle}>
              {editing ? editing.name : "New product"}
            </SheetTitle>
            <SheetClose
              className={styles.close}
              aria-label="Close"
              title="Close"
            >
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </SheetClose>
          </div>
          <div className={styles.sheetBody}>
            {shown && (
              <ProductEditor
                key={editing?.id ?? "new"}
                initial={editing ? valuesFromProduct(editing) : valuesFrom()}
                taxonomy={taxonomy}
                storageKey={storageKey(editing?.id)}
                stickyActions
                onSaved={(saved, input) => {
                  onSheet(null)
                  setNotice(
                    input.id
                      ? `Saved “${input.name}”.`
                      : input.status === "published"
                        ? `Added “${input.name}” to the shop.`
                        : `Added “${input.name}” as a draft.`
                  )
                }}
                onCancel={() => onSheet(null)}
                onDelete={
                  editing
                    ? () => {
                        setDeleteError(null)
                        onDeleting(editing.id)
                      }
                    : undefined
                }
              />
            )}
          </div>
          {sheetOpen && confirmation}
        </SheetContent>
      </Sheet>

      {!sheetOpen && confirmation}
    </div>
  )
}
