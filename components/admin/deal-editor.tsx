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
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react"
import { saveDealFromEditor } from "@/app/admin/deals/actions"
import { DealCard } from "@/components/deal-card"
import {
  UploadDropzone,
  type DropzoneUpload,
} from "@/components/ui/upload-dropzone"
import {
  DEAL_STATE_LABELS,
  dealState,
  inputFromDeal,
  itemFromProduct,
  type DealItemValues,
  type DealValues,
} from "@/lib/admin/deal-editor"
import {
  discardUpload,
  PHOTO_MAX_BYTES,
  uploadPhoto,
} from "@/lib/admin/photo-upload"
import { dealFromInput, type AdminProduct } from "@/lib/admin/preview"
import { changedInputFields, rebaseValues } from "@/lib/admin/product-editor"
import { dealInputSchema, UPLOADS } from "@/lib/admin/schemas"
import { toStoreDateTime } from "@/lib/admin/store-time"
import {
  DEAL_CONDITION_LABELS,
  DEAL_CONDITIONS,
  DEAL_KIND_LABELS,
  DEAL_KINDS,
  DEAL_PAGES,
} from "@/lib/deals"
import { mediaUrl } from "@/lib/media"
import adminStyles from "./admin.module.css"
import { Choice } from "./choice"
import { DateTimePicker } from "./date-time-picker"
import styles from "./product-editor.module.css"
import news from "./news-editor.module.css"
import deal from "./deal-editor.module.css"

// Plain words for what the shared schema rejects, by field.
const PROBLEMS: Record<string, string> = {
  title: "Give it a title.",
  image: "Describe the image.",
  items: "Each product needs a name, and prices look like 1,299.",
  ends_at: "The end must be after the start.",
}

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
] as const
const NO_CONDITION = "none"
const CONDITION_OPTIONS = [
  { value: NO_CONDITION, label: "No condition", first: true },
  ...DEAL_CONDITIONS.map((condition) => ({
    value: condition,
    label: DEAL_CONDITION_LABELS[condition],
  })),
]
const NO_PRODUCT = "none"

// Kept with the unsaved work, so a reload can rebase it on a newer save.
const baseKey = (key: string) => `${key}:base`

function restore(key: string | undefined, latest: DealValues) {
  if (!key || typeof window === "undefined") return null
  try {
    const read = (name: string) => {
      const saved = window.sessionStorage.getItem(name)
      const values = saved ? (JSON.parse(saved) as Partial<DealValues>) : null
      return values && Array.isArray(values.items)
        ? (values as DealValues)
        : null
    }
    const values = read(key)
    const base = values && latest.id ? read(baseKey(key)) : null
    return values && base ? rebaseValues(values, base, latest) : values
  } catch {
    return null
  }
}

/** A staged upload nothing has saved yet. */
const discardStaged = (path: string | undefined) => {
  if (path?.startsWith(UPLOADS)) void discardUpload(path).catch(() => {})
}

/**
 * The deal form: where it shows (QDeal or featured sale), its status and
 * dates, image or flyer, title, summary, products, and closing note, with
 * the card visitors see as a preview. Save writes it directly as the admin
 * (a Server Action), only the fields changed here for a saved deal, and an
 * open form takes a newer save of the deal (Tune's, say) on the fields the
 * owner hasn't touched. Unsaved work is kept in sessionStorage under
 * `storageKey`; Discard drops it.
 */
export function DealEditor({
  initial,
  products,
  storageKey,
  onSaved,
  onCancel,
  onDelete,
}: {
  initial: DealValues
  /** Every product, for linking rows to the shop. */
  products: AdminProduct[]
  storageKey?: string
  onSaved: (values: DealValues) => void
  onCancel: () => void
  /** Offered for a saved deal. */
  onDelete?: () => void
}) {
  const router = useRouter()
  const id = useId()
  const form = useRef<HTMLDivElement>(null)
  const [baseline, setBaseline] = useState(initial)
  const [values, setValues] = useState(
    () => restore(storageKey, initial) ?? initial
  )
  const [source, setSource] = useState(initial)
  if (JSON.stringify(initial) !== JSON.stringify(source)) {
    setSource(initial)
    if (initial.id && initial.id === source.id) {
      setValues(rebaseValues(values, baseline, initial))
      setBaseline(initial)
    }
  }
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [uploads, setUploads] = useState<DropzoneUpload[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [saving, startSaving] = useTransition()
  const focusError = useRef(false)

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline)
  const uploading = uploads.some((upload) => upload.status === "uploading")

  // Keep unsaved work across a reload, with what it started from; drop it
  // once saved.
  useEffect(() => {
    if (!storageKey) return
    if (dirty) {
      window.sessionStorage.setItem(storageKey, JSON.stringify(values))
      window.sessionStorage.setItem(
        baseKey(storageKey),
        JSON.stringify(baseline)
      )
    } else {
      window.sessionStorage.removeItem(storageKey)
      window.sessionStorage.removeItem(baseKey(storageKey))
    }
  }, [storageKey, values, baseline, dirty])

  // After a failed Save, focus the first marked field.
  useEffect(() => {
    if (!focusError.current) return
    focusError.current = false
    form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus()
  }, [errors])

  const clear = (field: string) => {
    if (!errors[field]) return
    setErrors((current) => {
      const rest = { ...current }
      delete rest[field]
      return rest
    })
  }
  const set = <K extends keyof DealValues>(key: K, value: DealValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    clear(
      key === "startsAt" || key === "endsAt"
        ? "ends_at"
        : key === "items"
          ? "items"
          : key
    )
  }
  const setItems = (change: (items: DealItemValues[]) => DealItemValues[]) => {
    setValues((current) => ({ ...current, items: change(current.items) }))
    clear("items")
  }
  const setItem = (key: string, change: Partial<DealItemValues>) =>
    setItems((items) =>
      items.map((item) => (item.key === key ? { ...item, ...change } : item))
    )
  const moveItem = (index: number, by: -1 | 1) =>
    setItems((items) => {
      const next = [...items]
      const [item] = next.splice(index, 1)
      next.splice(index + by, 0, item)
      return next
    })

  const uploadImage = (files: File[]) => {
    const file = files[0]
    if (!file) return
    const key = crypto.randomUUID()
    const update = (change: Partial<DropzoneUpload>) =>
      setUploads((current) =>
        current.map((item) => (item.id === key ? { ...item, ...change } : item))
      )
    setUploads([
      {
        id: key,
        name: file.name || "Image",
        size: file.size,
        progress: 0,
        status: "uploading",
      },
    ])
    uploadPhoto(file, { onProgress: (progress) => update({ progress }) }).then(
      (photo) => {
        update({ status: "done", progress: 1 })
        setValues((current) => {
          // An image dropped twice keeps the later one.
          if (current.image?.path !== baseline.image?.path)
            discardStaged(current.image?.path)
          return {
            ...current,
            image: { ...photo, alt: current.image?.alt ?? "" },
          }
        })
      },
      () => update({ status: "failed" })
    )
  }

  const removeImage = () => {
    if (values.image?.path !== baseline.image?.path)
      discardStaged(values.image?.path)
    setUploads([])
    set("image", null)
  }

  const candidate = inputFromDeal(values)
  const forget = () => {
    if (!storageKey) return
    window.sessionStorage.removeItem(storageKey)
    window.sessionStorage.removeItem(baseKey(storageKey))
  }

  const save = () => {
    const parsed = dealInputSchema.safeParse(candidate)
    if (!parsed.success) {
      const marked: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "ends_at")
        marked[field] ??= PROBLEMS[field] ?? issue.message
      }
      focusError.current = true
      setErrors(marked)
      setMessage("Check the marked fields.")
      return
    }
    const input = parsed.data
    // A saved deal writes only what changed here, so changes made elsewhere
    // since it opened (by Tune, say) stay.
    const started = inputFromDeal(baseline)
    const fields = input.id
      ? changedInputFields(
          input,
          dealInputSchema.safeParse(started).data ?? started
        )
      : undefined
    setMessage(null)
    startSaving(async () => {
      const result = await saveDealFromEditor(input, fields)
      if ("error" in result) {
        const marked = Object.fromEntries(
          Object.entries(result.fields ?? {}).map(([field, problem]) => [
            field,
            PROBLEMS[field] ?? problem,
          ])
        )
        focusError.current = Object.keys(marked).length > 0
        setErrors(marked)
        setMessage(result.error)
        return
      }
      forget()
      router.refresh()
      onSaved(values)
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
    className?: string
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
      </div>
      {control}
      {problem(name)}
    </div>
  )
  const dateField = (
    name: "startsAt" | "endsAt",
    label: string,
    placeholder: string
  ) =>
    field(
      name === "endsAt" ? "ends_at" : "starts_at",
      <>
        {label} <span className={styles.aside}>Optional</span>
      </>,
      <span className={news.date}>
        <DateTimePicker
          label={label}
          placeholder={placeholder}
          defaultTime={name === "endsAt" ? "23:59" : "09:00"}
          value={values[name]}
          onChange={(next) => set(name, next)}
          {...invalid(name === "endsAt" ? "ends_at" : "starts_at")}
        />
        {values[name] && (
          <button
            type="button"
            className={news.clear}
            aria-label={`Clear the ${label.toLowerCase()}`}
            title="Clear"
            onClick={() => set(name, "")}
          >
            <X size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        )}
      </span>,
      news.dateField
    )

  const now = toStoreDateTime(new Date())
  const state = dealState(
    {
      status: values.status,
      startsAt: values.startsAt || null,
      endsAt: values.endsAt || null,
    },
    now
  )
  const productOptions = [
    { value: NO_PRODUCT, label: "Not a shop product", first: true },
    ...products.map((product) => ({ value: product.id, label: product.name })),
  ]
  const preview = previewOpen
    ? dealFromInput(
        {
          ...candidate,
          items: candidate.items
            .filter((item) => item.name)
            .map((item) => ({
              ...item,
              price_cents:
                item.price_cents !== null && item.price_cents > 0
                  ? item.price_cents
                  : null,
            })),
          image: candidate.image?.alt ? candidate.image : null,
        },
        undefined,
        products
      )
    : null

  return (
    <div ref={form} className={`${styles.editor} ${styles.sheetEditor}`}>
      <div className={styles.editorContent}>
        <div className={styles.facets}>
          <fieldset className={styles.segmented}>
            <legend className={styles.label}>
              Shows on
              <span className={styles.aside}>{DEAL_PAGES[values.kind]}</span>
            </legend>
            <div>
              {DEAL_KINDS.map((kind) => (
                <label key={kind}>
                  <input
                    type="radio"
                    name={fieldId("kind")}
                    value={kind}
                    checked={values.kind === kind}
                    onChange={() => set("kind", kind)}
                  />
                  <span>{DEAL_KIND_LABELS[kind]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.segmented}>
            <legend className={styles.label}>
              Status
              <span className={styles.aside}>{DEAL_STATE_LABELS[state]}</span>
            </legend>
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
          {dateField("startsAt", "Starts", "Right away")}
          {dateField("endsAt", "Ends", "No end")}
        </div>

        <section className={news.cover} aria-labelledby={fieldId("image")}>
          <h3 id={fieldId("image")} className={styles.label}>
            Image or flyer
            <span className={styles.aside}>Optional</span>
          </h3>
          {values.image ? (
            <div className={news.coverRow}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={deal.image}
                src={mediaUrl(values.image.path)}
                alt=""
                crossOrigin="anonymous"
              />
              <div className={news.coverFields}>
                {field(
                  "image",
                  "Description",
                  <input
                    type="text"
                    value={values.image.alt}
                    maxLength={500}
                    placeholder="What the image shows"
                    onChange={(event) =>
                      set(
                        "image",
                        values.image && {
                          ...values.image,
                          alt: event.target.value,
                        }
                      )
                    }
                    {...invalid("image")}
                  />
                )}
                <div className={news.coverActions}>
                  <button
                    type="button"
                    className={adminStyles.quiet}
                    disabled={saving}
                    onClick={removeImage}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <UploadDropzone
              maxBytes={PHOTO_MAX_BYTES}
              onFiles={uploadImage}
              uploads={uploads}
              split
            />
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
              onChange={(event) => set("title", event.target.value)}
              {...invalid("title")}
            />,
            styles.full
          )}
          {field(
            "summary",
            <>
              Summary <span className={styles.aside}>Under the title</span>
            </>,
            <textarea
              rows={2}
              value={values.summary}
              maxLength={600}
              onChange={(event) => set("summary", event.target.value)}
              {...invalid("summary")}
            />,
            styles.full
          )}

          <section
            className={`${styles.field} ${styles.full}`}
            aria-labelledby={fieldId("items")}
          >
            <h3 id={fieldId("items")} className={styles.label}>
              Products
              <span className={styles.aside}>
                Optional · link one to its shop page
              </span>
            </h3>
            {values.items.length > 0 && (
              <ol className={deal.items}>
                {values.items.map((item, index) => {
                  const row = `Product ${index + 1}`
                  return (
                    <li key={item.key} className={deal.item}>
                      <Choice
                        small
                        className={deal.link}
                        value={item.product_id || NO_PRODUCT}
                        options={productOptions}
                        aria-label={`${row}: shop product`}
                        onChange={(value) => {
                          const product = products.find(
                            (candidate) => candidate.id === value
                          )
                          setItem(
                            item.key,
                            product
                              ? itemFromProduct(product, item.key)
                              : { product_id: "" }
                          )
                        }}
                      />
                      <input
                        type="text"
                        className={deal.brand}
                        value={item.brand}
                        maxLength={80}
                        placeholder="Brand"
                        aria-label={`${row}: brand`}
                        onChange={(event) =>
                          setItem(item.key, { brand: event.target.value })
                        }
                      />
                      <input
                        type="text"
                        className={deal.name}
                        value={item.name}
                        maxLength={160}
                        placeholder="Name"
                        aria-label={`${row}: name`}
                        aria-invalid={
                          (!!errors.items && !item.name.trim()) || undefined
                        }
                        onChange={(event) =>
                          setItem(item.key, { name: event.target.value })
                        }
                      />
                      <Choice
                        small
                        className={deal.condition}
                        value={item.condition || NO_CONDITION}
                        options={CONDITION_OPTIONS}
                        aria-label={`${row}: condition`}
                        onChange={(value) =>
                          setItem(item.key, {
                            condition:
                              value === NO_CONDITION
                                ? ""
                                : (value as DealItemValues["condition"]),
                          })
                        }
                      />
                      <span className={`${styles.affix} ${deal.price}`}>
                        <span aria-hidden="true">$</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={item.price}
                          placeholder="No price"
                          aria-label={`${row}: price`}
                          onChange={(event) =>
                            setItem(item.key, { price: event.target.value })
                          }
                        />
                      </span>
                      <span className={deal.rowActions}>
                        <button
                          type="button"
                          aria-label={`Move ${row} up`}
                          title="Move up"
                          disabled={index === 0}
                          onClick={() => moveItem(index, -1)}
                        >
                          <ArrowUp size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${row} down`}
                          title="Move down"
                          disabled={index === values.items.length - 1}
                          onClick={() => moveItem(index, 1)}
                        >
                          <ArrowDown size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${row}`}
                          title="Remove"
                          onClick={() =>
                            setItems((items) =>
                              items.filter((other) => other.key !== item.key)
                            )
                          }
                        >
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
            <div>
              <button
                type="button"
                className={adminStyles.secondary}
                disabled={saving || values.items.length >= 50}
                onClick={() =>
                  setItems((items) => [
                    ...items,
                    {
                      key: crypto.randomUUID(),
                      product_id: "",
                      brand: "",
                      name: "",
                      condition: "",
                      price: "",
                    },
                  ])
                }
              >
                <Plus size={15} aria-hidden="true" />
                Add product
              </button>
            </div>
            {problem("items")}
          </section>

          {field(
            "note",
            <>
              Closing note{" "}
              <span className={styles.aside}>Along the card’s foot</span>
            </>,
            <input
              type="text"
              value={values.note}
              maxLength={200}
              placeholder="Visit us for pricing."
              onChange={(event) => set("note", event.target.value)}
              {...invalid("note")}
            />,
            styles.full
          )}
        </div>

        <details
          className={adminStyles.preview}
          onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
        >
          <summary>Preview</summary>
          {preview &&
            (candidate.title ? (
              <div className={adminStyles.cardPreview} inert>
                <DealCard deal={preview} showEnd={values.kind === "sale"} />
              </div>
            ) : (
              <p className={adminStyles.hint}>Add a title to see the card.</p>
            ))}
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
          {saving ? "Saving…" : values.id ? "Save changes" : "Add deal"}
        </button>
        <button
          type="button"
          className={adminStyles.quiet}
          disabled={saving}
          onClick={() => {
            // Discarding drops the kept work and an image nothing saved.
            forget()
            if (values.image?.path !== baseline.image?.path)
              discardStaged(values.image?.path)
            onCancel()
          }}
        >
          {dirty ? "Discard" : "Close"}
        </button>
        {uploading && (
          <span className={adminStyles.hint} role="status">
            Uploading the image…
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
            Delete deal
          </button>
        )}
      </div>
    </div>
  )
}
