"use client"

import { useEffect, useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { Pencil, Plus, Search, Trash2, WandSparkles, X } from "lucide-react"
import {
  deleteDealFromAdmin,
  saveDealTableEdits,
} from "@/app/admin/deals/actions"
import { DealEditor } from "@/components/admin/deal-editor"
import { HaloButton } from "@/components/ui/halo-button"
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
import {
  DEAL_STATE_LABELS,
  dealPage,
  dealState,
  filterDeals,
  valuesFromDeal,
  type DealState,
} from "@/lib/admin/deal-editor"
import type { AdminDealItem, AdminProduct } from "@/lib/admin/preview"
import { toStoreDateTime } from "@/lib/admin/store-time"
import { DEAL_KIND_LABELS, DEAL_KINDS, type DealKind } from "@/lib/deals"
import { formatNewsDate } from "@/lib/news"
import { Choice } from "./choice"
import { ProductThumb } from "./product-review-table"
import adminStyles from "./admin.module.css"
import { toast } from "./admin-toast"
import page from "./products-view.module.css"
import table from "./product-table.module.css"
import styles from "./deals-view.module.css"

/** The deal the sheet shows: a new one of a kind, or a saved one by id. */
export type DealSheet =
  { mode: "new"; kind: DealKind } | { mode: "edit"; id: string }
/** What the chat's quick menus can ask the Deals tab to open. */
export type DealRequest = DealSheet | { mode: "delete"; id: string }

type Status = "draft" | "published"
const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
] as const
const ALL = "all"
const KIND_FILTERS = [
  { value: ALL, label: "Any kind", first: true },
  ...DEAL_KINDS.map((kind) => ({ value: kind, label: DEAL_KIND_LABELS[kind] })),
]
const STATE_FILTERS = [
  { value: ALL, label: "Any status", first: true },
  ...Object.entries(DEAL_STATE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
]

// The form's unsaved work, per deal, kept across closing the sheet.
const storageKey = (sheet: DealSheet) =>
  `qaudio:deals:${sheet.mode === "edit" ? sheet.id : `new-${sheet.kind}`}`

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

const day = (local: string) => formatNewsDate(local.slice(0, 10), "short")

/** "Nov 1 – Nov 29", "From Dec 1", "Until Nov 29", or "No dates". */
function dates(deal: AdminDealItem) {
  if (deal.startsAt && deal.endsAt)
    return `${day(deal.startsAt)} – ${day(deal.endsAt)}`
  if (deal.startsAt) return `From ${day(deal.startsAt)}`
  if (deal.endsAt) return `Until ${day(deal.endsAt)}`
  return "No dates"
}

/**
 * The admin's Deals tab: every QDeal and featured sale, drafts, scheduled,
 * and ended ones included, in a filterable table. A row's status changes in
 * place and saves with the others; its title or pencil opens the full deal
 * form in a sheet, the wand hands it to Tune in the chat, and the bin
 * deletes it after a confirmation. The sheet and the confirmation are
 * controlled by the admin shell, so the chat's quick menus can open them.
 * Everything but Tune saves directly as the signed-in admin.
 */
export function DealsView({
  deals,
  products,
  active,
  disabled,
  onTune,
  initialNow,
  sheet,
  onSheet,
  deleting,
  onDeleting,
}: {
  deals: AdminDealItem[]
  products: AdminProduct[]
  active: boolean
  /** Tune isn't ready yet. */
  disabled: boolean
  onTune: (deal?: AdminDealItem) => void
  initialNow: string
  sheet: DealSheet | null
  onSheet: (sheet: DealSheet | null) => void
  /** The id of the deal waiting for delete confirmation. */
  deleting: string | null
  onDeleting: (id: string | null) => void
}) {
  const router = useRouter()
  const id = useId()
  const [search, setSearch] = useState("")
  const [kind, setKind] = useState<DealKind | typeof ALL>(ALL)
  const [state, setState] = useState<DealState | typeof ALL>(ALL)
  const [now, setNow] = useState(initialNow)
  const [drafts, setDrafts] = useState<Partial<Record<string, Status>>>({})
  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [removing, startRemoving] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  // Set once the deal the sheet or confirmation came from is gone, so focus
  // goes to New deal instead of a row that no longer exists.
  const gone = useRef(false)

  useEffect(() => {
    if (!active) return
    const update = () => setNow(toStoreDateTime(new Date()))
    update()
    const timer = window.setInterval(update, 30_000)
    return () => window.clearInterval(timer)
  }, [active])

  const find = (dealId: string) => deals.find((deal) => deal.id === dealId)
  // The sheet and the confirmation keep showing their deal while they
  // close, even once it's deleted.
  const liveSheet =
    sheet?.mode === "edit" && !find(sheet.id)?.record ? null : sheet
  const [shown, setShown] = useState(liveSheet)
  if (liveSheet && liveSheet !== shown) setShown(liveSheet)
  const editing = shown?.mode === "edit" ? (find(shown.id) ?? null) : null
  const liveTarget = deleting ? find(deleting) : undefined
  const [target, setTarget] = useState(liveTarget)
  if (liveTarget && liveTarget !== target) setTarget(liveTarget)

  const visible = filterDeals(
    deals,
    {
      search,
      kind: kind === ALL ? "" : kind,
      state: state === ALL ? "" : state,
    },
    now
  )
  const changes = deals.flatMap((deal) => {
    const status = drafts[deal.id]
    return status && status !== deal.status ? [{ deal, status }] : []
  })
  const notLive = deals.filter((deal) => dealState(deal, now) !== "live").length

  const choose = (deal: AdminDealItem, status: Status) =>
    setDrafts((all) => {
      const next = { ...all }
      if (status === deal.status) delete next[deal.id]
      else next[deal.id] = status
      return next
    })

  const save = () => {
    const edits = changes.map(({ deal, status }) => ({ id: deal.id, status }))
    const titles = changes.map(({ deal }) => deal.title)
    setSaveError(null)
    startSaving(async () => {
      const result = await saveDealTableEdits(edits)
      if ("error" in result) {
        setSaveError(result.error)
        return
      }
      startSaving(() => {
        setDrafts({})
        router.refresh()
      })
      toast(
        "success",
        titles.length === 1
          ? { title: "Saved", description: `“${titles[0]}”` }
          : { title: `Saved ${titles.length} deals` }
      )
    })
  }

  const open = (next: DealSheet) => {
    gone.current = false
    onSheet(next)
  }
  const askDelete = (deal: AdminDealItem) => {
    gone.current = false
    setDeleteError(null)
    onDeleting(deal.id)
  }

  const confirmDelete = () => {
    if (!target) return
    const deal = target
    setDeleteError(null)
    startRemoving(async () => {
      const result = await deleteDealFromAdmin({
        id: deal.id,
        title: deal.title,
      })
      if ("error" in result) {
        setDeleteError(result.error)
        return
      }
      const kept = storageKey({ mode: "edit", id: deal.id })
      window.sessionStorage.removeItem(kept)
      window.sessionStorage.removeItem(`${kept}:base`)
      gone.current = true
      startRemoving(() => {
        onDeleting(null)
        if (sheet?.mode === "edit" && sheet.id === deal.id) onSheet(null)
        setDrafts((all) => {
          const rest = { ...all }
          delete rest[deal.id]
          return rest
        })
        router.refresh()
      })
      toast("success", { title: "Deleted", description: `“${deal.title}”` })
    })
  }

  const finalFocus = () => (gone.current ? newButton.current : true)
  const sheetOpen = liveSheet !== null
  const changedId = `${id}-changed`
  const regionId = `${id}-deals`

  // Opened from the sheet, the confirmation nests inside it, so pressing it
  // doesn't count as pressing outside the sheet.
  const confirmation = (
    <AlertDialog
      open={!!liveTarget}
      onOpenChange={(next) => !next && !removing && onDeleting(null)}
    >
      <AlertDialogContent className={page.confirm} finalFocus={finalFocus}>
        <AlertDialogHeader className={page.confirmHeader}>
          <AlertDialogTitle className={page.confirmTitle}>
            Delete “{target?.title}”?
          </AlertDialogTitle>
          <AlertDialogDescription className={page.confirmText}>
            It comes off {target ? dealPage(target) : "the site"} for good. To
            hide it but keep it, set it to Draft instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {deleteError && (
          <p className={adminStyles.error} role="alert">
            {deleteError}
          </p>
        )}
        <AlertDialogFooter className={page.confirmActions}>
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
    <div className={page.page}>
      <div className={page.head}>
        <h2>Deals</h2>
        <p className={page.total}>
          {plural(deals.length, "deal")}
          {notLive > 0 && ` · ${notLive} not live`}
        </p>
        <div className={styles.headActions}>
          <HaloButton
            type="button"
            idleClassName={adminStyles.secondary}
            disabled={disabled}
            onClick={() => onTune()}
          >
            <WandSparkles size={15} aria-hidden="true" />
            Write with Tune
          </HaloButton>
          <button
            ref={newButton}
            type="button"
            className={adminStyles.primary}
            onClick={() =>
              open({ mode: "new", kind: kind === ALL ? "qdeal" : kind })
            }
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            New deal
          </button>
        </div>
      </div>

      <div className={table.productTable}>
        <div className={table.toolbar}>
          <label className={table.search}>
            <Search size={14} strokeWidth={2} aria-hidden="true" />
            <span className="visually-hidden">Search deals</span>
            <input
              type="search"
              value={search}
              placeholder="Search"
              aria-controls={regionId}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className={table.facet}>
            <Choice
              small
              value={kind}
              options={KIND_FILTERS}
              onChange={(value) => setKind(value as DealKind | typeof ALL)}
              aria-label="Kind"
            />
          </div>
          <div className={table.facet}>
            <Choice
              small
              value={state}
              options={STATE_FILTERS}
              onChange={(value) => setState(value as DealState | typeof ALL)}
              aria-label="Status"
            />
          </div>
        </div>

        <div id={regionId} className={table.region}>
          {visible.length > 0 && (
            <div className={table.frame}>
              <div className={table.scroller}>
                <table className={`${table.table} ${styles.table}`}>
                  <caption className="visually-hidden">Deals</caption>
                  <thead>
                    <tr>
                      <th scope="col" className={table.photoColumn}>
                        <span className="visually-hidden">Image</span>
                      </th>
                      <th scope="col">Deal</th>
                      <th scope="col">Kind</th>
                      <th scope="col">Status</th>
                      <th scope="col">Dates</th>
                      <th scope="col" className={styles.actionsColumn}>
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((deal) => {
                      const status = drafts[deal.id] ?? (deal.status as Status)
                      const changed = status !== deal.status || undefined
                      const where = dealState({ ...deal, status }, now)
                      return (
                        <tr key={deal.id}>
                          <td>
                            <ProductThumb src={deal.image?.src} />
                          </td>
                          <th scope="row" className={styles.deal}>
                            <button
                              type="button"
                              className={table.name}
                              onClick={() =>
                                open({ mode: "edit", id: deal.id })
                              }
                            >
                              {deal.title}
                            </button>
                            <span className={table.brand}>
                              {dealPage(deal)}
                            </span>
                          </th>
                          <td className={table.category}>
                            {DEAL_KIND_LABELS[deal.kind ?? "qdeal"]}
                          </td>
                          <td>
                            <span className={table.cell} data-changed={changed}>
                              <Choice
                                small
                                value={status}
                                options={STATUSES}
                                aria-label={`Status of ${deal.title}`}
                                aria-describedby={changed && changedId}
                                onChange={(value) =>
                                  choose(deal, value as Status)
                                }
                              />
                            </span>
                            {where !== "draft" && (
                              <span className={table.sale}>
                                {DEAL_STATE_LABELS[where]}
                              </span>
                            )}
                          </td>
                          <td className={styles.dates}>{dates(deal)}</td>
                          <td className={styles.actionsColumn}>
                            <span className={table.rowActions}>
                              <button
                                type="button"
                                className={table.iconButton}
                                aria-label={`Edit ${deal.title}`}
                                title="Edit"
                                onClick={() =>
                                  open({ mode: "edit", id: deal.id })
                                }
                              >
                                <Pencil
                                  size={15}
                                  strokeWidth={2}
                                  aria-hidden="true"
                                />
                              </button>
                              <HaloButton
                                type="button"
                                idleClassName={table.iconButton}
                                aria-label={`Edit ${deal.title} with Tune`}
                                title="Edit with Tune"
                                disabled={disabled}
                                onClick={() => onTune(deal)}
                              >
                                <WandSparkles size={15} aria-hidden="true" />
                              </HaloButton>
                              <button
                                type="button"
                                className={table.iconButton}
                                aria-label={`Delete ${deal.title}`}
                                title="Delete"
                                onClick={() => askDelete(deal)}
                              >
                                <Trash2
                                  size={15}
                                  strokeWidth={2}
                                  aria-hidden="true"
                                />
                              </button>
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <span id={changedId} hidden>
            Changed
          </span>
          <div className={table.pager}>
            <p className={table.count} role="status">
              {visible.length > 0
                ? visible.length === deals.length
                  ? plural(visible.length, "deal")
                  : `${plural(visible.length, "deal")} of ${deals.length}`
                : deals.length > 0
                  ? "No deals match."
                  : "No deals yet."}
            </p>
          </div>
        </div>

        {changes.length > 0 && (
          <div className={table.footer}>
            <p className={table.changed}>
              {plural(changes.length, "deal")} changed
            </p>
            <div className={table.footerActions}>
              <button
                type="button"
                className={adminStyles.primary}
                disabled={saving}
                onClick={save}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className={adminStyles.secondary}
                disabled={saving}
                onClick={() => {
                  setDrafts({})
                  setSaveError(null)
                }}
              >
                Discard
              </button>
            </div>
            {saveError && (
              <p className={table.alert} role="alert">
                {saveError}
              </p>
            )}
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={(next) => !next && onSheet(null)}>
        <SheetContent
          render={<motion.div layoutRoot />}
          side="right"
          showCloseButton={false}
          className={page.sheet}
          overlayClassName={page.overlay}
          finalFocus={finalFocus}
        >
          <div className={page.sheetHeader}>
            <SheetTitle className={page.sheetTitle}>
              {editing
                ? editing.title
                : shown?.mode === "new"
                  ? `New ${DEAL_KIND_LABELS[shown.kind].toLowerCase()}`
                  : "Deal"}
            </SheetTitle>
            <SheetClose className={page.close} aria-label="Close" title="Close">
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </SheetClose>
          </div>
          <div className={page.sheetBody}>
            {shown && (shown.mode === "new" || editing?.record) && (
              <DealEditor
                key={shown.mode === "edit" ? shown.id : `new-${shown.kind}`}
                initial={
                  shown.mode === "edit"
                    ? valuesFromDeal(editing?.record)
                    : valuesFromDeal(undefined, shown.kind)
                }
                products={products}
                storageKey={storageKey(shown)}
                onSaved={(values) => {
                  onSheet(null)
                  toast("success", {
                    title: values.id
                      ? "Saved"
                      : values.status === "published"
                        ? "Added"
                        : "Added as a draft",
                    description: `“${values.title.trim()}”`,
                  })
                }}
                onCancel={() => onSheet(null)}
                onDelete={editing ? () => askDelete(editing) : undefined}
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
