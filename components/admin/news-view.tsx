"use client"

import { useEffect, useId, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { Pencil, Plus, Search, Trash2, WandSparkles, X } from "lucide-react"
import {
  deleteNewsFromAdmin,
  saveNewsTableEdits,
} from "@/app/admin/news/actions"
import { NewsEditor } from "@/components/admin/news-editor"
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
import type { AdminNewsItem } from "@/lib/admin/preview"
import { filterNews, newsStatus, type NewsStatus } from "@/lib/admin/news"
import { blankNewsValues, valuesFromNews } from "@/lib/admin/news-editor"
import type { NewsRecord } from "@/lib/admin/news-save"
import type { NewsQuickEdit } from "@/lib/admin/schemas"
import { formatStoreDateTime, toStoreDateTime } from "@/lib/admin/store-time"
import { Choice } from "./choice"
import adminStyles from "./admin.module.css"
import page from "./products-view.module.css"
import table from "./product-table.module.css"
import styles from "./news-view.module.css"

const STATUS_LABELS: Record<NewsStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  published: "Published",
}
const ALL = "all"
const FILTERS = [
  { value: ALL, label: "Any status" },
  ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

// The form's unsaved work, per post, kept across closing the sheet.
const storageKey = (id?: string) => `qaudio:news:${id ?? "new"}`

type Sheet = { mode: "new" } | { mode: "edit"; id: string }
/** The full post the sheet edits, read when it opens (none yet: loading). */
type Loaded =
  | { id: string; state: "failed"; message: string }
  | { id: string; state: "ready"; post: NewsRecord }

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

/** A row's status options: Scheduled only while it has a future date. */
const statusOptions = (post: AdminNewsItem, now: string) => [
  { value: "draft", label: STATUS_LABELS.draft },
  ...(post.publishedAt && post.publishedAt > now
    ? [{ value: "scheduled", label: STATUS_LABELS.scheduled }]
    : []),
  { value: "published", label: STATUS_LABELS.published },
]

/**
 * A chosen status as the save it needs. Published publishes now unless the
 * post already has a past date; Scheduled and Draft keep the date.
 */
function quickEdit(
  post: AdminNewsItem,
  status: NewsStatus,
  now: string
): NewsQuickEdit {
  if (status === "draft") return { id: post.id, status: "draft" }
  const publishNow =
    status === "published" && (!post.publishedAt || post.publishedAt > now)
  return {
    id: post.id,
    status: "published",
    ...(publishNow && { published_at: "now" as const }),
  }
}

/**
 * The admin's News tab, like a CMS collection: every post, drafts and
 * scheduled ones included, in a filterable table. A row's status changes in
 * place and saves with the others; its title or pencil opens the full post
 * form in a sheet, the wand hands it to Tune in the chat, and the bin
 * deletes it after a confirmation. Everything but Tune saves directly as
 * the signed-in admin.
 */
export function NewsView({
  posts,
  active,
  disabled,
  onTune,
  initialNow,
}: {
  posts: AdminNewsItem[]
  active: boolean
  /** Tune isn't ready yet. */
  disabled: boolean
  onTune: (post?: AdminNewsItem) => void
  initialNow: string
}) {
  const router = useRouter()
  const id = useId()
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<NewsStatus | typeof ALL>(ALL)
  const [now, setNow] = useState(initialNow)
  const [drafts, setDrafts] = useState<Record<string, NewsStatus>>({})
  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [sheet, setSheet] = useState<Sheet | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [deleting, setDeleting] = useState<AdminNewsItem | null>(null)
  const [removing, startRemoving] = useTransition()
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  // Set once the post the sheet or confirmation came from is gone, so focus
  // goes to New post instead of a row that no longer exists.
  const gone = useRef(false)

  useEffect(() => {
    if (!active) return
    const update = () => setNow(toStoreDateTime(new Date()))
    update()
    const timer = window.setInterval(update, 30_000)
    return () => window.clearInterval(timer)
  }, [active])

  // A notice reads for a few seconds, then clears.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  // The sheet's post, read fresh each time it opens.
  const editId = sheet?.mode === "edit" ? sheet.id : null
  useEffect(() => {
    if (!editId) return
    const request = new AbortController()
    fetch(`/api/admin/news?id=${encodeURIComponent(editId)}`, {
      signal: request.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (response.ok) {
          const post = (await response.json()) as NewsRecord
          setLoaded({ id: editId, state: "ready", post })
          return
        }
        setLoaded({
          id: editId,
          state: "failed",
          message:
            response.status === 404
              ? "This post was deleted."
              : response.status === 401
                ? "Your session expired. Reload the page to sign in."
                : "Couldn’t load this post.",
        })
      })
      .catch(() => {
        if (request.signal.aborted) return
        setLoaded({
          id: editId,
          state: "failed",
          message: "Couldn’t load this post.",
        })
      })
    return () => request.abort()
  }, [editId, attempt])

  const visible = filterNews(posts, search, filter, now)
  const changes = posts.flatMap((post) => {
    const status = drafts[post.id]
    return status && status !== newsStatus(post, now) ? [{ post, status }] : []
  })
  const coverless = changes.filter(
    ({ post, status }) => status !== "draft" && post.hasCover === false
  )

  const choose = (post: AdminNewsItem, status: NewsStatus) =>
    setDrafts((all) => {
      const next = { ...all }
      if (status === newsStatus(post, now)) delete next[post.id]
      else next[post.id] = status
      return next
    })

  const save = () => {
    const edits = changes.map(({ post, status }) =>
      quickEdit(post, status, now)
    )
    const titles = changes.map(({ post }) => post.title)
    setSaveError(null)
    startSaving(async () => {
      const result = await saveNewsTableEdits(edits)
      if ("error" in result) {
        setSaveError(result.error)
        return
      }
      startSaving(() => {
        setDrafts({})
        router.refresh()
      })
      setNotice(
        titles.length === 1
          ? `Saved “${titles[0]}”.`
          : `Saved ${titles.length} posts.`
      )
    })
  }

  const open = (next: Sheet) => {
    gone.current = false
    setLoaded(null)
    setSheet(next)
  }
  const askDelete = (post: AdminNewsItem) => {
    gone.current = false
    setDeleteError(null)
    setDeleting(post)
  }

  const confirmDelete = () => {
    if (!deleting) return
    const target = deleting
    setDeleteError(null)
    startRemoving(async () => {
      const result = await deleteNewsFromAdmin({
        id: target.id,
        title: target.title,
      })
      if ("error" in result) {
        setDeleteError(result.error)
        return
      }
      window.sessionStorage.removeItem(storageKey(target.id))
      gone.current = true
      startRemoving(() => {
        setDeleting(null)
        if (editId === target.id) setSheet(null)
        setDrafts((all) => {
          const rest = { ...all }
          delete rest[target.id]
          return rest
        })
        router.refresh()
      })
      setNotice(`Deleted “${target.title}”.`)
    })
  }

  const finalFocus = () => (gone.current ? newButton.current : true)
  const editing = editId ? posts.find((post) => post.id === editId) : undefined
  const ready =
    loaded?.state === "ready" && loaded.id === editId ? loaded.post : null
  const failed =
    loaded?.state === "failed" && loaded.id === editId ? loaded.message : null
  const sheetOpen = sheet !== null
  const changedId = `${id}-changed`
  const regionId = `${id}-news`
  const unpublished = posts.filter(
    (post) => newsStatus(post, now) !== "published"
  ).length

  // Opened from the sheet, the confirmation nests inside it, so pressing it
  // doesn't count as pressing outside the sheet.
  const confirmation = (
    <AlertDialog
      open={!!deleting}
      onOpenChange={(next) => !next && !removing && setDeleting(null)}
    >
      <AlertDialogContent className={page.confirm} finalFocus={finalFocus}>
        <AlertDialogHeader className={page.confirmHeader}>
          <AlertDialogTitle className={page.confirmTitle}>
            Delete “{deleting?.title}”?
          </AlertDialogTitle>
          <AlertDialogDescription className={page.confirmText}>
            It comes off the site for good. To hide it but keep it, set it to
            Draft instead.
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
        <h2>News</h2>
        <p className={page.total}>
          {plural(posts.length, "post")}
          {unpublished > 0 && ` · ${unpublished} not live`}
        </p>
        <p className={page.notice} role="status">
          {notice}
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
            onClick={() => open({ mode: "new" })}
          >
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
            New post
          </button>
        </div>
      </div>

      <div className={table.productTable}>
        <div className={table.toolbar}>
          <label className={table.search}>
            <Search size={14} strokeWidth={2} aria-hidden="true" />
            <span className="visually-hidden">Search news</span>
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
              value={filter}
              options={FILTERS}
              onChange={(value) => setFilter(value as NewsStatus | typeof ALL)}
              aria-label="Status"
            />
          </div>
        </div>

        <div id={regionId} className={table.region}>
          {visible.length > 0 && (
            <div className={table.frame}>
              <div className={table.scroller}>
                <table className={`${table.table} ${styles.table}`}>
                  <caption className="visually-hidden">News posts</caption>
                  <thead>
                    <tr>
                      <th scope="col">Post</th>
                      <th scope="col">Status</th>
                      <th scope="col">Publication</th>
                      <th scope="col" className={styles.actionsColumn}>
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((post) => {
                      const saved = newsStatus(post, now)
                      const status = drafts[post.id] ?? saved
                      const changed = status !== saved || undefined
                      const needsCover =
                        changed && status !== "draft" && post.hasCover === false
                      const problemId = `${id}-${post.id}-cover`
                      return (
                        <tr key={post.id}>
                          <th scope="row" className={styles.post}>
                            <button
                              type="button"
                              className={table.name}
                              onClick={() =>
                                open({ mode: "edit", id: post.id })
                              }
                            >
                              {post.title}
                            </button>
                            <span className={table.brand}>
                              /news/{post.slug}
                            </span>
                          </th>
                          <td>
                            <span
                              className={table.cell}
                              data-changed={changed}
                            >
                              <Choice
                                small
                                value={status}
                                options={statusOptions(post, now)}
                                aria-label={`Status of ${post.title}`}
                                aria-invalid={needsCover || undefined}
                                aria-describedby={
                                  [needsCover && problemId, changed && changedId]
                                    .filter(Boolean)
                                    .join(" ") || undefined
                                }
                                onChange={(value) =>
                                  choose(post, value as NewsStatus)
                                }
                              />
                            </span>
                            {needsCover && (
                              <span id={problemId} className={table.problem}>
                                Add a cover first
                              </span>
                            )}
                          </td>
                          <td className={styles.date}>
                            {post.publishedAt ? (
                              <time dateTime={post.publishedAt}>
                                {formatStoreDateTime(post.publishedAt)}
                              </time>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className={styles.actionsColumn}>
                            <span className={table.rowActions}>
                              <button
                                type="button"
                                className={table.iconButton}
                                aria-label={`Edit ${post.title}`}
                                title="Edit"
                                onClick={() =>
                                  open({ mode: "edit", id: post.id })
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
                                aria-label={`Edit ${post.title} with Tune`}
                                title="Edit with Tune"
                                disabled={disabled}
                                onClick={() => onTune(post)}
                              >
                                <WandSparkles size={15} aria-hidden="true" />
                              </HaloButton>
                              <button
                                type="button"
                                className={table.iconButton}
                                aria-label={`Delete ${post.title}`}
                                title="Delete"
                                onClick={() => askDelete(post)}
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
                ? visible.length === posts.length
                  ? plural(visible.length, "post")
                  : `${plural(visible.length, "post")} of ${posts.length}`
                : posts.length > 0
                  ? "No posts match."
                  : "No news posts yet."}
            </p>
          </div>
        </div>

        {changes.length > 0 && (
          <div className={table.footer}>
            <p className={table.changed}>
              {plural(changes.length, "post")} changed
            </p>
            <div className={table.footerActions}>
              <button
                type="button"
                className={adminStyles.primary}
                disabled={saving || coverless.length > 0}
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
            {coverless.length > 0 && (
              <p className={`${adminStyles.hint} ${table.note}`}>
                Add a cover to{" "}
                {coverless.map(({ post }) => `“${post.title}”`).join(", ")}{" "}
                before publishing.
              </p>
            )}
            {saveError && (
              <p className={table.alert} role="alert">
                {saveError}
              </p>
            )}
          </div>
        )}
      </div>

      <Sheet open={sheetOpen} onOpenChange={(next) => !next && setSheet(null)}>
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
              {sheet?.mode === "edit"
                ? (ready?.title ?? editing?.title ?? "News post")
                : "New post"}
            </SheetTitle>
            <SheetClose className={page.close} aria-label="Close" title="Close">
              <X size={18} strokeWidth={2} aria-hidden="true" />
            </SheetClose>
          </div>
          <div className={page.sheetBody}>
            {sheet?.mode === "new" && (
              <NewsEditor
                key="new"
                initial={blankNewsValues()}
                storageKey={storageKey()}
                onSaved={(input) => {
                  setSheet(null)
                  setNotice(
                    input.status === "published"
                      ? `Added “${input.title}”.`
                      : `Added “${input.title}” as a draft.`
                  )
                }}
                onCancel={() => setSheet(null)}
              />
            )}
            {sheet?.mode === "edit" &&
              (ready ? (
                <NewsEditor
                  key={ready.id}
                  initial={valuesFromNews(ready)}
                  original={ready}
                  storageKey={storageKey(ready.id)}
                  onSaved={(input) => {
                    setSheet(null)
                    setNotice(`Saved “${input.title}”.`)
                  }}
                  onCancel={() => setSheet(null)}
                  onDelete={() => {
                    const post = editing ?? {
                      id: ready.id,
                      slug: ready.slug,
                      title: ready.title,
                      status: ready.status,
                      publishedAt: ready.published_at,
                    }
                    askDelete(post)
                  }}
                />
              ) : (
                <div className={styles.loading}>
                  {failed ? (
                    <>
                      <p role="alert">{failed}</p>
                      <button
                        type="button"
                        className={adminStyles.secondary}
                        onClick={() => {
                          setLoaded(null)
                          setAttempt((count) => count + 1)
                        }}
                      >
                        Try again
                      </button>
                    </>
                  ) : (
                    <p role="status">Loading…</p>
                  )}
                </div>
              ))}
          </div>
          {sheetOpen && confirmation}
        </SheetContent>
      </Sheet>

      {!sheetOpen && confirmation}
    </div>
  )
}
