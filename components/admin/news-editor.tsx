"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import { ImagePlus, Trash2, X } from "lucide-react"
import { saveNewsFromEditor } from "@/app/admin/news/actions"
import { NewsBody } from "@/components/news-body"
import { NewsCard } from "@/components/news-card"
import {
  UploadDropzone,
  type DropzoneUpload,
} from "@/components/ui/upload-dropzone"
import {
  inputFromNews,
  markdownToBlocks,
  slugify,
  type BodyProblem,
  type NewsValues,
} from "@/lib/admin/news-editor"
import { newsExpired } from "@/lib/admin/news"
import type { NewsRecord } from "@/lib/admin/news-save"
import {
  discardUpload,
  PHOTO_MAX_BYTES,
  uploadPhoto,
} from "@/lib/admin/photo-upload"
import { newsFromInput } from "@/lib/admin/preview"
import {
  newsPostInputSchema,
  UPLOADS,
  type NewsPostInput,
} from "@/lib/admin/schemas"
import { toStoreDateTime } from "@/lib/admin/store-time"
import { mediaUrl } from "@/lib/media"
import adminStyles from "./admin.module.css"
import { DateTimePicker } from "./date-time-picker"
import styles from "./product-editor.module.css"
import news from "./news-editor.module.css"

// Plain words for what the shared schema rejects, by field.
const PROBLEMS: Record<string, string> = {
  title: "Give it a title.",
  slug: "Use lowercase words joined by dashes.",
  body: "Check the article.",
  cover: "Describe the cover photo.",
  published_at: "Pick a date and time.",
}
const BODY_PROBLEMS: Record<BodyProblem, string> = {
  "photo-size": "Add photos with Add photo; their addresses can’t be typed.",
  "photo-alt": "Describe each photo between the brackets: ![what it shows].",
}

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
] as const
const FITS = [
  { value: "cover", label: "Fill" },
  { value: "contain", label: "Fit" },
] as const

function restore(key: string | undefined): NewsValues | null {
  if (!key || typeof window === "undefined") return null
  try {
    const saved = window.sessionStorage.getItem(key)
    const values = saved ? (JSON.parse(saved) as Partial<NewsValues>) : null
    return values && typeof values.body === "string" && values.photos
      ? (values as NewsValues)
      : null
  } catch {
    return null
  }
}

/** Staged uploads among these paths: nothing has saved them yet. */
const discardStaged = (paths: Iterable<string>) => {
  for (const path of paths) {
    if (path.startsWith(UPLOADS)) void discardUpload(path).catch(() => {})
  }
}

/** Joins a block into Markdown at `at`, with a blank line on each side. */
function insertBlock(text: string, at: number, block: string) {
  const before = text.slice(0, at).replace(/\s+$/, "")
  const after = text.slice(at).replace(/^\s+/, "")
  return [before, block, after].filter(Boolean).join("\n\n")
}

/**
 * The news post form: title and address, status and publication time, the
 * cover photo, and the article in Markdown with photos, plus the feed card
 * and article as a preview. Save writes it directly as the admin (a Server
 * Action). Unsaved work is kept in sessionStorage under `storageKey`, so
 * closing the sheet or reloading doesn't lose it; Discard drops it.
 */
export function NewsEditor({
  initial,
  original,
  storageKey,
  onSaved,
  onCancel,
  onDelete,
}: {
  initial: NewsValues
  /** The saved post, so an untouched article keeps its exact blocks. */
  original?: NewsRecord
  storageKey?: string
  onSaved: (input: NewsPostInput) => void
  onCancel: () => void
  /** Offered for a saved post. */
  onDelete?: () => void
}) {
  const router = useRouter()
  const id = useId()
  const form = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [values, setValues] = useState(() => ({
    ...initial,
    ...restore(storageKey),
  }))
  // A new post's address follows its title until the owner edits it.
  const [slugFollows, setSlugFollows] = useState(
    !initial.id && (!initial.slug || initial.slug === slugify(initial.title))
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [coverUploads, setCoverUploads] = useState<DropzoneUpload[]>([])
  const [bodyUploads, setBodyUploads] = useState({ busy: 0, failed: 0 })
  const [showBody, setShowBody] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saving, startSaving] = useTransition()
  const focusError = useRef(false)

  const dirty = JSON.stringify(values) !== JSON.stringify(initial)
  const uploading =
    bodyUploads.busy > 0 ||
    coverUploads.some((upload) => upload.status === "uploading")

  // Keep unsaved work across a reload; drop it once saved.
  useEffect(() => {
    if (!storageKey) return
    if (dirty) {
      window.sessionStorage.setItem(storageKey, JSON.stringify(values))
    } else {
      window.sessionStorage.removeItem(storageKey)
    }
  }, [storageKey, values, dirty])

  // After a failed Save, focus the first marked field.
  useEffect(() => {
    if (!focusError.current) return
    focusError.current = false
    form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus()
  }, [errors])

  const set = <K extends keyof NewsValues>(key: K, value: NewsValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    const field =
      key === "publishedAt"
        ? "published_at"
        : key === "expiresAt"
          ? "expires_at"
          : key
    if (errors[field]) {
      setErrors((current) => {
        const rest = { ...current }
        delete rest[field]
        return rest
      })
    }
  }

  const setTitle = (title: string) => {
    set("title", title)
    if (slugFollows) set("slug", slugify(title))
  }

  const uploadCover = (files: File[]) => {
    const file = files[0]
    if (!file) return
    const key = crypto.randomUUID()
    const update = (change: Partial<DropzoneUpload>) =>
      setCoverUploads((current) =>
        current.map((item) => (item.id === key ? { ...item, ...change } : item))
      )
    setCoverUploads([
      {
        id: key,
        name: file.name || "Photo",
        size: file.size,
        progress: 0,
        status: "uploading",
      },
    ])
    uploadPhoto(file, { onProgress: (progress) => update({ progress }) }).then(
      (photo) => {
        update({ status: "done", progress: 1 })
        setValues((current) => {
          // A cover dropped twice keeps the later one.
          if (current.cover) discardStaged([current.cover.path])
          return {
            ...current,
            cover: {
              ...photo,
              alt: current.cover?.alt ?? "",
              fit: current.cover?.fit ?? "cover",
            },
          }
        })
      },
      () => update({ status: "failed" })
    )
  }

  const removeCover = () => {
    if (values.cover) discardStaged([values.cover.path])
    setCoverUploads([])
    set("cover", null)
  }

  // Photos go into the article where the cursor was, each as its own block.
  const uploadBodyPhotos = (files: File[]) => {
    setBodyUploads((current) => ({
      busy: current.busy + files.length,
      failed: 0,
    }))
    for (const file of files) {
      uploadPhoto(file, { onProgress: () => {} }).then(
        (photo) => {
          setBodyUploads((current) => ({ ...current, busy: current.busy - 1 }))
          const at = textarea.current?.selectionEnd
          setValues((current) => ({
            ...current,
            photos: {
              ...current.photos,
              [photo.path]: { width: photo.width, height: photo.height },
            },
            body: insertBlock(
              current.body,
              at ?? current.body.length,
              `![](${photo.path})`
            ),
          }))
        },
        () =>
          setBodyUploads((current) => ({
            busy: current.busy - 1,
            failed: current.failed + 1,
          }))
      )
    }
  }

  const { input: candidate, problem: bodyProblem } = inputFromNews(
    values,
    original
  )

  /** Staged photos the post no longer uses. */
  const unused = (input: NewsPostInput | null) => {
    const used = new Set(
      input
        ? [
            ...(input.cover ? [input.cover.path] : []),
            ...input.body.flatMap((block) =>
              block.type === "image" ? [block.image.src] : []
            ),
          ]
        : []
    )
    return [
      ...Object.keys(values.photos),
      ...(values.cover ? [values.cover.path] : []),
    ].filter((path) => !used.has(path))
  }

  const forget = () => {
    if (storageKey) window.sessionStorage.removeItem(storageKey)
  }

  const save = () => {
    const parsed = newsPostInputSchema.safeParse(candidate)
    const marked: Record<string, string> = {}
    for (const issue of parsed.error?.issues ?? []) {
      const field = String(issue.path[0] ?? "")
      if (field) marked[field] ??= PROBLEMS[field] ?? issue.message
    }
    if (bodyProblem) marked.body = BODY_PROBLEMS[bodyProblem]
    if (candidate.status === "published" && !candidate.cover) {
      marked.cover = "Add a cover photo to publish."
    }
    if (!parsed.success || Object.keys(marked).length > 0) {
      focusError.current = true
      if (marked.body) setShowBody(false)
      setErrors(marked)
      setMessage("Check the marked fields.")
      return
    }
    const input = parsed.data
    setMessage(null)
    startSaving(async () => {
      const result = await saveNewsFromEditor(input)
      if ("error" in result) {
        focusError.current = !!result.fields
        setErrors(result.fields ?? {})
        setMessage(result.error)
        return
      }
      forget()
      discardStaged(unused(input))
      router.refresh()
      onSaved(input)
    })
  }

  // Each control's id, and its problem tied to it for assistive tech.
  const fieldId = (name: string) => `${id}-${name}`
  const invalid = (name: string) => ({
    id: fieldId(name),
    ...(errors[name] && {
      "aria-invalid": true as const,
      "aria-describedby": `${fieldId(name)}-problem`,
    }),
  })
  const problem = (name: string) =>
    errors[name] && (
      <span id={`${fieldId(name)}-problem`} className={styles.problem}>
        {errors[name]}
      </span>
    )
  const field = (
    name: string,
    label: ReactNode,
    control: ReactNode,
    className?: string,
    labelAction?: ReactNode
  ) => (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <div className={styles.fieldHeading}>
        <label
          id={`${fieldId(name)}-label`}
          htmlFor={fieldId(name)}
          className={styles.label}
        >
          {label}
        </label>
        {labelAction}
      </div>
      {control}
      {problem(name)}
    </div>
  )

  // Where the post stands once saved, beside the date's label.
  const now = toStoreDateTime(new Date())
  const timing =
    values.status === "draft"
      ? "Hidden from the site"
      : newsExpired(
            {
              expiresAt: values.expiresAt || null,
              linkedSales: original?.linkedSales,
            },
            now
          )
        ? "Expired"
        : !values.publishedAt
          ? "Publishes on save"
          : values.publishedAt > now
            ? "Scheduled"
            : "Live"

  const bodyPreview = showBody
    ? markdownToBlocks(values.body, values.photos).blocks
    : null
  const preview = previewOpen
    ? newsFromInput({
        ...candidate,
        cover: candidate.cover?.alt ? candidate.cover : null,
      })
    : null
  const coverPreview = previewOpen && candidate.cover && !candidate.cover.alt

  return (
    <div ref={form} className={`${styles.editor} ${styles.sheetEditor}`}>
      <div className={styles.editorContent}>
        <div className={styles.facets}>
          <fieldset className={styles.segmented}>
            <legend className={styles.label}>Status</legend>
            <div>
              {STATUSES.map((status) => (
                <label key={status.value}>
                  <input
                    type="radio"
                    name={fieldId("status")}
                    value={status.value}
                    checked={values.status === status.value}
                    onChange={() => set("status", status.value)}
                  />
                  <span>{status.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {field(
            "published_at",
            <>
              Publication
              <span className={styles.aside}>{timing}</span>
            </>,
            <span className={news.date}>
              <DateTimePicker
                label="Publication"
                placeholder="Not set"
                value={values.publishedAt}
                onChange={(next) => set("publishedAt", next)}
                {...invalid("published_at")}
              />
              {values.publishedAt && (
                <button
                  type="button"
                  className={news.clear}
                  aria-label="Clear the publication date"
                  title="Clear"
                  onClick={() => set("publishedAt", "")}
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </span>,
            news.dateField
          )}
          {field(
            "expires_at",
            <>
              Expiration <span className={styles.aside}>Optional</span>
            </>,
            <span className={news.date}>
              <DateTimePicker
                label="Expiration"
                placeholder="No expiration"
                value={values.expiresAt}
                onChange={(next) => set("expiresAt", next)}
                {...invalid("expires_at")}
              />
              {values.expiresAt && (
                <button
                  type="button"
                  className={news.clear}
                  aria-label="Clear the expiration date"
                  title="Clear"
                  onClick={() => set("expiresAt", "")}
                >
                  <X size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
            </span>,
            news.dateField
          )}
        </div>

        <section className={news.cover} aria-labelledby={fieldId("cover")}>
          <h3 id={fieldId("cover")} className={styles.label}>
            Cover
            <span className={styles.aside}>Needed to publish</span>
          </h3>
          {values.cover ? (
            <div className={news.coverRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={news.coverPhoto}
                src={mediaUrl(values.cover.path)}
                alt=""
                crossOrigin="anonymous"
                data-fit={values.cover.fit}
              />
              <div className={news.coverFields}>
                {field(
                  "cover",
                  "Description",
                  <input
                    type="text"
                    value={values.cover.alt}
                    maxLength={500}
                    placeholder="What the photo shows"
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        cover: current.cover && {
                          ...current.cover,
                          alt: event.target.value,
                        },
                      }))
                    }
                    {...invalid("cover")}
                  />
                )}
                <div className={news.coverActions}>
                  <fieldset className={styles.segmented}>
                    <legend className="sr-only">Cover framing</legend>
                    <div>
                      {FITS.map((fit) => (
                        <label key={fit.value}>
                          <input
                            type="radio"
                            name={fieldId("fit")}
                            value={fit.value}
                            checked={values.cover?.fit === fit.value}
                            onChange={() =>
                              setValues((current) => ({
                                ...current,
                                cover: current.cover && {
                                  ...current.cover,
                                  fit: fit.value,
                                },
                              }))
                            }
                          />
                          <span>{fit.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button
                    type="button"
                    className={adminStyles.quiet}
                    disabled={saving}
                    onClick={removeCover}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <UploadDropzone
                maxBytes={PHOTO_MAX_BYTES}
                onFiles={uploadCover}
                uploads={coverUploads}
                split
              />
              {errors.cover && (
                <span className={styles.problem} role="alert">
                  {errors.cover}
                </span>
              )}
            </>
          )}
        </section>

        <div className={styles.fields}>
          {field(
            "title",
            "Title",
            <input
              type="text"
              value={values.title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
              {...invalid("title")}
            />,
            styles.wide
          )}
          {field(
            "slug",
            "Address",
            <span className={styles.affix}>
              <span aria-hidden="true">/news/</span>
              <input
                type="text"
                value={values.slug}
                maxLength={120}
                onChange={(event) => {
                  setSlugFollows(false)
                  set("slug", event.target.value)
                }}
                {...invalid("slug")}
              />
            </span>,
            news.slug
          )}
          {field(
            "body",
            "Article",
            <div className={styles.markdownField}>
              <div className={news.bodyTools}>
                <div className={styles.modes}>
                  <button
                    type="button"
                    aria-pressed={!showBody}
                    onClick={() => setShowBody(false)}
                  >
                    Write
                  </button>
                  <button
                    type="button"
                    aria-pressed={showBody}
                    onClick={() => setShowBody(true)}
                  >
                    Preview
                  </button>
                </div>
                <button
                  type="button"
                  className={adminStyles.quiet}
                  disabled={saving || showBody}
                  onClick={() => fileInput.current?.click()}
                >
                  <ImagePlus size={15} aria-hidden="true" />
                  Add photo
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(event) => {
                    const files = [...(event.target.files ?? [])].filter(
                      (file) =>
                        file.type.startsWith("image/") &&
                        file.size <= PHOTO_MAX_BYTES
                    )
                    event.target.value = ""
                    if (files.length > 0) uploadBodyPhotos(files)
                  }}
                />
              </div>
              {bodyPreview ? (
                bodyPreview.length > 0 ? (
                  <div className={news.bodyPreview}>
                    <NewsBody
                      blocks={
                        newsFromInput({ ...candidate, body: bodyPreview }).body
                      }
                      compact
                    />
                  </div>
                ) : (
                  <p className={styles.markdownPreview}>Nothing written yet.</p>
                )
              ) : (
                <textarea
                  ref={textarea}
                  rows={14}
                  value={values.body}
                  placeholder={
                    "What happened, in a few lines.\n\n## A heading\n\n- A point\n- Another point\n\n**Bold** and [links](https://…)"
                  }
                  onChange={(event) => set("body", event.target.value)}
                  {...invalid("body")}
                />
              )}
              <span className={adminStyles.hint} role="status">
                {bodyUploads.busy > 0
                  ? `Uploading ${bodyUploads.busy} photo${bodyUploads.busy === 1 ? "" : "s"}…`
                  : bodyUploads.failed > 0
                    ? "A photo couldn’t upload. Try again."
                    : ""}
              </span>
            </div>,
            styles.full
          )}
        </div>

        <details
          className={adminStyles.preview}
          onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
        >
          <summary>Preview</summary>
          {preview && (
            <div className={adminStyles.newsPreview}>
              <section
                aria-label="News feed preview"
                className={adminStyles.newsGridPreview}
              >
                <p className={adminStyles.newsPreviewLabel}>Feed</p>
                {preview.card ? (
                  <div inert>
                    <NewsCard
                      post={preview.card}
                      position={1}
                      total={1}
                      compact
                    />
                  </div>
                ) : (
                  <p className={adminStyles.hint}>
                    {coverPreview
                      ? "Describe the cover to see the card."
                      : "Add a cover to see the card."}
                  </p>
                )}
              </section>
              <section
                aria-label="News article preview"
                className={adminStyles.newsArticlePreview}
                tabIndex={0}
              >
                <p className={adminStyles.newsPreviewLabel}>Article</p>
                <div inert>
                  <p className={adminStyles.articleTitle}>
                    {candidate.title || "Untitled"}
                  </p>
                  <NewsBody blocks={preview.body} compact />
                </div>
              </section>
            </div>
          )}
        </details>

        {message && (
          <p className={adminStyles.error} role="alert">
            {message}
          </p>
        )}
      </div>
      <div className={`${styles.actions} ${styles.stickyActions}`}>
        <button
          type="button"
          className={adminStyles.primary}
          disabled={saving || uploading || (!dirty && !!values.id)}
          onClick={save}
        >
          {saving ? "Saving…" : values.id ? "Save changes" : "Add post"}
        </button>
        <button
          type="button"
          className={adminStyles.quiet}
          disabled={saving}
          onClick={() => {
            // Discarding drops the kept work and photos nothing saved.
            forget()
            discardStaged(unused(null))
            onCancel()
          }}
        >
          {dirty ? "Discard" : "Close"}
        </button>
        {uploading && (
          <span className={adminStyles.hint} role="status">
            Uploading photos…
          </span>
        )}
        {onDelete && values.id && (
          <button
            type="button"
            className={`${adminStyles.quiet} ${styles.delete}`}
            disabled={saving}
            onClick={onDelete}
          >
            <Trash2 size={15} aria-hidden="true" />
            Delete post
          </button>
        )}
      </div>
    </div>
  )
}
