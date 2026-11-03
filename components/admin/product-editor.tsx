"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { motion } from "motion/react"
import { ChevronLeft, ChevronRight, Trash2, X } from "lucide-react"
import {
  generateProductCardLine,
  saveProductFromEditor,
} from "@/app/admin/actions"
import { ProductPageView } from "@/components/product-catalog"
import {
  UploadDropzone,
  type DropzoneUpload,
} from "@/components/ui/upload-dropzone"
import {
  discardUpload,
  PHOTO_MAX_BYTES,
  uploadPhoto,
} from "@/lib/admin/photo-upload"
import {
  inputFromValues,
  slugify,
  type ProductValues,
} from "@/lib/admin/product-editor"
import { productFromInput, type CatalogTaxonomy } from "@/lib/admin/preview"
import {
  productCardLineInputSchema,
  productInputSchema,
  UPLOADS,
  type ProductInput,
} from "@/lib/admin/schemas"
import { mediaUrl } from "@/lib/media"
import { MarkdownText } from "@/components/markdown-text"
import { Choice } from "./choice"
import adminStyles from "./admin.module.css"
import styles from "./product-editor.module.css"

/** What a successful Save returns: the product's id, address, photo paths. */
export type SavedProduct = { id: string; slug: string; images: string[] }

// Plain words for what the shared schema rejects, by field.
const PROBLEMS: Record<string, string> = {
  name: "Give it a name.",
  slug: "Use lowercase words joined by dashes.",
  category_slug: "Pick a category.",
  brand_slug: "Pick a brand.",
  price_cents: "Enter a price, like 1,299.",
  msrp_cents: "Enter the list price, or leave it empty.",
  short_description: "Keep it under 300 characters.",
  description: "Keep it under 10,000 characters.",
  manufacturer_url: "Use the brand’s page address, starting with https://.",
  images: "Up to 20 photos, each with a description.",
}

const CONDITIONS = ["New", "Demo", "Used"] as const
const UNITS = [
  { value: "each", label: "Each" },
  { value: "pair", label: "As a pair" },
]
const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
] as const

function restore(key: string | undefined): ProductValues | null {
  if (!key || typeof window === "undefined") return null
  try {
    const saved = window.sessionStorage.getItem(key)
    const values = saved ? (JSON.parse(saved) as ProductValues) : null
    return values && Array.isArray(values.images) ? values : null
  } catch {
    return null
  }
}

/**
 * The product form: one product's fields, the shop's own page as a live
 * preview, and Save, which writes it directly as the admin (a Server
 * Action). Unsaved work is kept in sessionStorage under `storageKey`, so
 * closing the sheet or reloading doesn't lose it; Discard drops it.
 */
export function ProductEditor({
  initial,
  taxonomy,
  storageKey,
  disabled = false,
  stickyActions = false,
  onSaved,
  onCancel,
  onDelete,
}: {
  initial: ProductValues
  taxonomy: CatalogTaxonomy
  storageKey?: string
  disabled?: boolean
  /** Keeps Save in view at the foot of a scrolling sheet. */
  stickyActions?: boolean
  onSaved: (saved: SavedProduct, input: ProductInput) => void
  onCancel?: () => void
  /** Offered for a saved product. */
  onDelete?: () => void
}) {
  const router = useRouter()
  const id = useId()
  const form = useRef<HTMLDivElement>(null)
  const [baseline, setBaseline] = useState(initial)
  const [values, setValues] = useState(() => restore(storageKey) ?? initial)
  // A new product's address follows its name until the owner edits it.
  const [slugFollows, setSlugFollows] = useState(
    !initial.id && (!initial.slug || initial.slug === slugify(initial.name))
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [uploads, setUploads] = useState<DropzoneUpload[]>([])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [showDescription, setShowDescription] = useState(false)
  const [editingCard, setEditingCard] = useState(false)
  const [cardLineError, setCardLineError] = useState<string | null>(null)
  const [writingCard, startWritingCard] = useTransition()
  const cardLineRequest = useRef(0)
  const [saving, startSaving] = useTransition()
  const focusError = useRef(false)

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline)
  const uploading = uploads.some((upload) => upload.status === "uploading")

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

  // A request from a closed/hidden editor must not update its draft later.
  useEffect(
    () => () => {
      cardLineRequest.current += 1
    },
    []
  )

  const set = <K extends keyof ProductValues>(
    key: K,
    value: ProductValues[K]
  ) => {
    if (
      [
        "name",
        "brand_slug",
        "category_slug",
        "condition",
        "description",
        "short_description",
      ].includes(key)
    ) {
      cardLineRequest.current += 1
      setCardLineError(null)
    }
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === "name" && slugFollows && { slug: slugify(String(value)) }),
    }))
    const field =
      key === "price" ? "price_cents" : key === "msrp" ? "msrp_cents" : key
    if (errors[field]) {
      setErrors((current) => {
        const rest = { ...current }
        delete rest[field]
        return rest
      })
    }
  }

  const upload = (files: File[]) => {
    for (const file of files) {
      const key = crypto.randomUUID()
      const update = (change: Partial<DropzoneUpload>) =>
        setUploads((current) =>
          current.map((item) =>
            item.id === key ? { ...item, ...change } : item
          )
        )
      setUploads((current) => [
        ...current,
        {
          id: key,
          name: file.name || "Photo",
          size: file.size,
          progress: 0,
          status: "uploading",
        },
      ])
      uploadPhoto(file, {
        onProgress: (progress) => update({ progress }),
      }).then(
        (photo) => {
          update({ status: "done", progress: 1 })
          setValues((current) => ({
            ...current,
            images: [...current.images, { ...photo, alt: "" }],
          }))
        },
        () => update({ status: "failed" })
      )
    }
  }

  const movePhoto = (index: number, step: -1 | 1) =>
    setValues((current) => {
      const images = [...current.images]
      const to = index + step
      if (to < 0 || to >= images.length) return current
      ;[images[index], images[to]] = [images[to], images[index]]
      return { ...current, images }
    })

  const removePhoto = (index: number) => {
    const photo = values.images[index]
    setValues((current) => ({
      ...current,
      images: current.images.filter((_, at) => at !== index),
    }))
    // A staged upload nothing has saved yet; saved photos stay in storage.
    if (photo?.path.startsWith(UPLOADS)) {
      void discardUpload(photo.path).catch(() => {})
    }
  }

  const candidate = inputFromValues(values)
  const parsed = productInputSchema.safeParse(candidate)
  const cardLineInput = productCardLineInputSchema.safeParse({
    name: candidate.name || undefined,
    brand_slug: candidate.brand_slug || undefined,
    category_slug: candidate.category_slug || undefined,
    condition: candidate.condition,
    description: candidate.description,
  })

  const writeCard = () => {
    if (!cardLineInput.success || writingCard) return
    const request = ++cardLineRequest.current
    setCardLineError(null)
    startWritingCard(async () => {
      try {
        const result = await generateProductCardLine(cardLineInput.data)
        // Keep edits made while Tune was writing, including a manual line.
        if (request !== cardLineRequest.current) return
        if ("error" in result) {
          setCardLineError(result.error)
          return
        }
        set("short_description", result.short_description)
        setEditingCard(false)
      } catch {
        if (request === cardLineRequest.current) {
          setCardLineError("Couldn’t write the card line. Try again.")
        }
      }
    })
  }

  const save = () => {
    if (!parsed.success) {
      const marked: Record<string, string> = {}
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "")
        marked[field] ??= PROBLEMS[field] ?? issue.message
      }
      focusError.current = true
      // Show the fields that need fixing.
      if (marked.short_description) setEditingCard(true)
      if (marked.description) setShowDescription(false)
      setErrors(marked)
      setMessage("Check the marked fields.")
      return
    }
    const input = parsed.data
    setMessage(null)
    startSaving(async () => {
      const result = await saveProductFromEditor(input)
      if ("error" in result) {
        const marked = Object.fromEntries(
          Object.entries(result.fields ?? {}).map(([field, problem]) => [
            field,
            PROBLEMS[field] && field !== "slug" ? PROBLEMS[field] : problem,
          ])
        )
        focusError.current = Object.keys(marked).length > 0
        setErrors(marked)
        setMessage(result.error)
        return
      }
      if (storageKey) window.sessionStorage.removeItem(storageKey)
      // Saved: the product exists now, and its photos have their final paths.
      const next: ProductValues = {
        ...values,
        id: result.id,
        slug: result.slug,
        short_description: result.short_description,
        images: input.images.map((image, index) => ({
          ...image,
          path: result.images[index] ?? image.path,
        })),
      }
      setValues(next)
      setBaseline(next)
      setSlugFollows(false)
      setErrors({})
      setEditingCard(false)
      router.refresh()
      onSaved(result, {
        ...input,
        short_description: result.short_description,
      })
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
  const field = (
    name: string,
    label: ReactNode,
    control: ReactNode,
    className?: string
  ) => (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label
        id={`${fieldId(name)}-label`}
        htmlFor={fieldId(name)}
        className={styles.label}
      >
        {label}
      </label>
      {control}
      {errors[name] && (
        <span id={`${fieldId(name)}-problem`} className={styles.problem}>
          {errors[name]}
        </span>
      )}
    </div>
  )

  const preview =
    previewOpen && parsed.success
      ? productFromInput(parsed.data, taxonomy)
      : null

  return (
    <div ref={form} className={styles.editor}>
      {/* The product's place in the shop, first, like a table's filters. */}
      <div className={styles.facets}>
        {field(
          "category_slug",
          "Category",
          <Choice
            value={values.category_slug}
            placeholder="Choose…"
            options={taxonomy.categories.map(({ slug, name }) => ({
              value: slug,
              label: name,
            }))}
            onChange={(value) => set("category_slug", value)}
            aria-labelledby={`${fieldId("category_slug")}-label`}
            {...invalid("category_slug")}
          />
        )}
        {field(
          "brand_slug",
          "Brand",
          <Choice
            value={values.brand_slug}
            placeholder="Choose…"
            options={taxonomy.brands.map(({ slug, name }) => ({
              value: slug,
              label: name,
            }))}
            onChange={(value) => set("brand_slug", value)}
            aria-labelledby={`${fieldId("brand_slug")}-label`}
            {...invalid("brand_slug")}
          />
        )}
        <fieldset className={styles.segmented}>
          <legend className={styles.label}>Condition</legend>
          {/* In the shop's condition-badge colors: the cue the details
              page gives the same value. */}
          <div>
            {CONDITIONS.map((condition) => (
              <label key={condition} data-tone={condition.toLowerCase()}>
                <input
                  type="radio"
                  name={fieldId("condition")}
                  value={condition}
                  checked={values.condition === condition}
                  onChange={() => set("condition", condition)}
                />
                <span>{condition}</span>
              </label>
            ))}
          </div>
        </fieldset>
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
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={values.ready_for_audition}
            onChange={(event) =>
              set("ready_for_audition", event.target.checked)
            }
          />
          <span>Ready for audition</span>
        </label>
      </div>

      <section className={styles.photos} aria-labelledby={fieldId("photos")}>
        <h3 id={fieldId("photos")} className={styles.label}>
          Photos
          <span className={styles.aside}>The first is the cover</span>
        </h3>
        {values.images.length > 0 && (
          <ol className={styles.photoList}>
            {values.images.map((photo, index) => (
              <motion.li
                key={photo.path}
                layout="position"
                transition={{
                  layout: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
                }}
              >
                <Image
                  src={mediaUrl(photo.path)}
                  alt=""
                  width={112}
                  height={112}
                  sizes="112px"
                />
                <input
                  type="text"
                  value={photo.alt}
                  placeholder="Describe this photo"
                  aria-label={`Description of photo ${index + 1}`}
                  onChange={(event) =>
                    set(
                      "images",
                      values.images.map((item, at) =>
                        at === index
                          ? { ...item, alt: event.target.value }
                          : item
                      )
                    )
                  }
                />
                <div className={styles.photoActions}>
                  <button
                    type="button"
                    aria-label={`Move photo ${index + 1} earlier`}
                    disabled={index === 0}
                    onClick={() => movePhoto(index, -1)}
                  >
                    <ChevronLeft size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move photo ${index + 1} later`}
                    disabled={index === values.images.length - 1}
                    onClick={() => movePhoto(index, 1)}
                  >
                    <ChevronRight size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove photo ${index + 1}`}
                    onClick={() => removePhoto(index)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              </motion.li>
            ))}
          </ol>
        )}
        <UploadDropzone
          maxBytes={PHOTO_MAX_BYTES}
          onFiles={upload}
          uploads={uploads}
        />
        {errors.images && (
          <span className={styles.problem} role="alert">
            {errors.images}
          </span>
        )}
      </section>

      <div className={styles.fields}>
        {field(
          "name",
          "Name",
          <input
            type="text"
            value={values.name}
            maxLength={160}
            onChange={(event) => set("name", event.target.value)}
            {...invalid("name")}
          />,
          styles.wide
        )}
        {field(
          "slug",
          "Address",
          <span className={styles.affix}>
            <span aria-hidden="true">/products/</span>
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
          styles.wide
        )}
        {field(
          "price_cents",
          "Price",
          <span className={styles.affix}>
            <span aria-hidden="true">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={values.price}
              placeholder="1,299"
              onChange={(event) => set("price", event.target.value)}
              {...invalid("price_cents")}
            />
          </span>
        )}
        {field(
          "msrp_cents",
          <>
            List price <span className={styles.aside}>MSRP, optional</span>
          </>,
          <span className={styles.affix}>
            <span aria-hidden="true">$</span>
            <input
              type="text"
              inputMode="decimal"
              value={values.msrp}
              onChange={(event) => set("msrp", event.target.value)}
              {...invalid("msrp_cents")}
            />
          </span>
        )}
        {field(
          "price_unit",
          "Sold",
          <Choice
            value={values.price_unit}
            options={UNITS}
            onChange={(value) => set("price_unit", value as "each" | "pair")}
            aria-labelledby={`${fieldId("price_unit")}-label`}
            {...invalid("price_unit")}
          />
        )}
        {field(
          "description",
          <>
            Description
            <span className={styles.aside}>
              “- ” starts a bullet, **bold** for emphasis
            </span>
          </>,
          <div className={styles.markdownField}>
            <div className={styles.modes}>
              <button
                type="button"
                aria-pressed={!showDescription}
                onClick={() => setShowDescription(false)}
              >
                Write
              </button>
              <button
                type="button"
                aria-pressed={showDescription}
                onClick={() => setShowDescription(true)}
              >
                Preview
              </button>
            </div>
            {showDescription ? (
              values.description.trim() ? (
                <MarkdownText
                  className={styles.markdownPreview}
                  text={values.description}
                />
              ) : (
                <p className={styles.markdownPreview}>Nothing written yet.</p>
              )
            ) : (
              <textarea
                rows={9}
                value={values.description}
                placeholder={
                  "What it is, in a line.\n\n- A feature\n- Another feature\n\n**Hand assembled in the USA**"
                }
                onChange={(event) => set("description", event.target.value)}
                {...invalid("description")}
              />
            )}
          </div>,
          styles.full
        )}
        {/* Tune can draft the card line from the current description,
            ready to review or edit before Save. */}
        <div className={`${styles.field} ${styles.full}`}>
          <span
            id={`${fieldId("short_description")}-label`}
            className={styles.label}
          >
            Card line
            {editingCard && (
              <span className={styles.aside}>
                {values.short_description.length}/300
              </span>
            )}
          </span>
          {editingCard ? (
            <textarea
              rows={2}
              value={values.short_description}
              aria-labelledby={`${fieldId("short_description")}-label`}
              onChange={(event) => set("short_description", event.target.value)}
              {...invalid("short_description")}
            />
          ) : (
            <p
              className={styles.cardLine}
              aria-live="polite"
              aria-busy={writingCard}
            >
              {values.short_description}
            </p>
          )}
          {errors.short_description && (
            <span
              id={`${fieldId("short_description")}-problem`}
              className={styles.problem}
            >
              {errors.short_description}
            </span>
          )}
          <div className={styles.inlineActions}>
            {!editingCard && (
              <button
                type="button"
                className={styles.editCard}
                disabled={disabled || saving || writingCard}
                onClick={() => setEditingCard(true)}
              >
                {values.short_description ? "Edit" : "Write it myself"}
              </button>
            )}
            {(cardLineInput.success || writingCard) && (
              <button
                type="button"
                className={adminStyles.secondary}
                disabled={disabled || saving || writingCard}
                onClick={writeCard}
              >
                {writingCard ? "Writing…" : "Let Tune write it"}
              </button>
            )}
          </div>
          {cardLineError && (
            <p className={styles.problem} role="alert">
              {cardLineError}
            </p>
          )}
        </div>
        {field(
          "manufacturer_url",
          "Manufacturer page",
          <input
            type="url"
            value={values.manufacturer_url}
            placeholder="https://"
            onChange={(event) => set("manufacturer_url", event.target.value)}
            {...invalid("manufacturer_url")}
          />,
          styles.full
        )}
      </div>

      <details
        className={adminStyles.preview}
        onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
      >
        <summary>Preview</summary>
        {preview && "product" in preview ? (
          <div className={adminStyles.productPreview} inert>
            <ProductPageView product={preview.product} />
          </div>
        ) : (
          <p className={adminStyles.hint}>
            {preview?.problem ??
              "Add a name, category, brand, and price to see the page."}
          </p>
        )}
      </details>

      {message && (
        <p className={adminStyles.error} role="alert">
          {message}
        </p>
      )}
      <div
        className={[styles.actions, stickyActions && styles.stickyActions]
          .filter(Boolean)
          .join(" ")}
      >
        <button
          type="button"
          className={adminStyles.primary}
          disabled={
            disabled ||
            saving ||
            writingCard ||
            uploading ||
            (!dirty && !!values.id)
          }
          onClick={save}
        >
          {saving ? "Saving…" : values.id ? "Save changes" : "Add product"}
        </button>
        {onCancel && (
          <button
            type="button"
            className={adminStyles.quiet}
            disabled={saving}
            onClick={() => {
              // Discarding drops the work kept for this product.
              if (storageKey) window.sessionStorage.removeItem(storageKey)
              onCancel()
            }}
          >
            {dirty ? "Discard" : "Close"}
          </button>
        )}
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
            Delete product
          </button>
        )}
      </div>
    </div>
  )
}
