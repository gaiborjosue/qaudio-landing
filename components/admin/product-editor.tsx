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
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  Check,
  CircleCheck,
  LoaderCircle,
  BadgePercent,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react"
import {
  generateProductCardLine,
  saveProductFromEditor,
} from "@/app/admin/actions"
import { ProductPageView } from "@/components/product-catalog"
import { HaloButton } from "@/components/ui/halo-button"
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
  changedInputFields,
  inputFromValues,
  parseDollars,
  PREFILL_FIELDS,
  rebaseValues,
  slugify,
  type PrefillField,
  type ProductPageStatus,
  type ProductSuggestions,
  type ProductValues,
} from "@/lib/admin/product-editor"
import { productFromInput, type CatalogTaxonomy } from "@/lib/admin/preview"
import {
  conditionNotes,
  conditionScore,
  withConditionNotes,
  withConditionScore,
} from "@/lib/admin/condition-score"
import {
  isOrderableAvailability,
  isUsedEquipment,
  PRODUCT_AVAILABILITY_OPTIONS,
} from "@/lib/catalog"
import { toStoreDateTime } from "@/lib/admin/store-time"
import {
  productCardLineInputSchema,
  productInputSchema,
  UPLOADS,
  type ProductInput,
} from "@/lib/admin/schemas"
import { MarkdownText } from "@/components/markdown-text"
import { Choice } from "./choice"
import { SaleDateRange } from "./sale-date-range"
import { ProductPhotos } from "./product-photos"
import { ScoreSlider } from "./score-slider"
import adminStyles from "./admin.module.css"
import { toast } from "./admin-toast"
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
  short_description: "Keep it under 1000 characters.",
  description: "Keep it under 10,000 characters.",
  manufacturer_url: "Use the brand’s page address, starting with https://.",
  images: "Up to 20 photos, each with a description.",
  sale: "Enter a sale price below the price, and when the sale ends (after it starts).",
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

// What a kept draft started from, so it can be rebased on a newer save.
const baseKey = (key: string) => `${key}:base`

function readValues(key: string): ProductValues | null {
  const saved = window.sessionStorage.getItem(key)
  const values = saved ? (JSON.parse(saved) as Partial<ProductValues>) : null
  // Drafts kept before the sale fields existed have none.
  return values && Array.isArray(values.images)
    ? ({
        sale_price: "",
        sale_starts: "",
        sale_ends: "",
        ...values,
      } as ProductValues)
    : null
}

/**
 * The unsaved work kept for this form, rebased on `latest` (the product as
 * saved now) when it's known what the work started from.
 */
function restore(
  key: string | undefined,
  latest?: ProductValues
): ProductValues | null {
  if (!key || typeof window === "undefined") return null
  try {
    const values = readValues(key)
    const base = latest && values ? readValues(baseKey(key)) : null
    return values && base && latest
      ? rebaseValues(values, base, latest)
      : values
  } catch {
    return null
  }
}

/**
 * Tune's suggestions still waiting for the owner: each prefilled field's
 * value from before, and the suggested photos' paths.
 */
type Review = {
  fields: Partial<Record<PrefillField, string>>
  photos: string[]
  /** A successful Prefill stays complete after its fields are accepted. */
  url?: string
}
const NO_REVIEW: Review = { fields: {}, photos: [] }
const reviewKey = (key: string) => `${key}:tune`

// Kept with the unsaved work, so a reload keeps the marks.
function restoreReview(key: string | undefined): Review {
  if (!key || typeof window === "undefined") return NO_REVIEW
  const draft = restore(key)
  if (!draft) return NO_REVIEW
  try {
    const saved = JSON.parse(
      window.sessionStorage.getItem(reviewKey(key)) ?? "null"
    ) as Review | null
    if (!saved || typeof saved.fields !== "object" || !saved.fields) {
      return NO_REVIEW
    }
    const fields: Review["fields"] = {}
    for (const field of PREFILL_FIELDS) {
      const previous = saved.fields[field]
      if (typeof previous === "string") fields[field] = previous
    }
    const photos = Array.isArray(saved.photos)
      ? saved.photos.filter((path) => typeof path === "string")
      : []
    // Older drafts kept review marks without the page they came from.
    const url =
      typeof saved.url === "string"
        ? saved.url
        : Object.keys(fields).length || photos.length
          ? draft.manufacturer_url.trim()
          : undefined
    return { fields, photos, url }
  } catch {
    return NO_REVIEW
  }
}

/** How each field's accept and reject buttons name it. */
const REVIEW_LABELS: Record<PrefillField, string> = {
  name: "name",
  brand_slug: "brand",
  category_slug: "category",
  msrp: "list price",
  price_unit: "unit",
  description: "description",
  short_description: "card line",
}

type LinkState = ProductPageStatus | "checking" | "failed"
const LINK_STATES = new Set<string>(["ok", "blocked", "missing", "unreachable"])
// Beside the field's label: why Prefill isn't offered, or can't be sure.
const LINK_NOTES: Partial<Record<LinkState, string>> = {
  blocked: "Couldn’t verify this page",
  missing: "Page not found",
  unreachable: "Couldn’t reach this page",
  failed: "Couldn’t check this page",
}
const linkAnnouncement = (state: LinkState | null) =>
  state === "checking"
    ? "Checking the page…"
    : state === "ok"
      ? "Page found."
      : state
        ? `${LINK_NOTES[state]}.`
        : ""
const manufacturerUrl = productInputSchema.shape.manufacturer_url
const PREFILL_FAILED = "Couldn’t prefill from this page. Try again."

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
  /** Keep the footer at the sheet's bottom while the fields scroll. */
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
  const [values, setValues] = useState(
    () => restore(storageKey, initial.id ? initial : undefined) ?? initial
  )
  const hasSale = (form: ProductValues) =>
    !!(form.sale_price.trim() || form.sale_starts || form.sale_ends)
  const [saleEnabled, setSaleEnabled] = useState(() => hasSale(values))
  // A newer save of this product (Tune's, say) while the form is open: the
  // fields the owner hasn't touched take it, and their own edits stay.
  const [source, setSource] = useState(initial)
  if (JSON.stringify(initial) !== JSON.stringify(source)) {
    setSource(initial)
    if (initial.id && initial.id === source.id) {
      const rebased = rebaseValues(values, baseline, initial)
      setValues(rebased)
      setBaseline(initial)
      if (hasSale(rebased)) setSaleEnabled(true)
    }
  }
  const saleToggle = useRef<HTMLButtonElement>(null)
  const still = useReducedMotion()
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
  // Prefill with Tune: the manufacturer page's check, the request, and the
  // suggestions waiting for the owner's accept or reject.
  const [review, setReview] = useState(() => restoreReview(storageKey))
  const [linkCheck, setLinkCheck] = useState<{
    url: string
    state: LinkState
  } | null>(null)
  const linkResults = useRef(new Map<string, ProductPageStatus>())
  const [prefilling, setPrefilling] = useState(false)
  const [prefillError, setPrefillError] = useState<string | null>(null)
  const [prefillNote, setPrefillNote] = useState("")
  const prefillRequest = useRef<AbortController | null>(null)
  const prefillFor = useRef("")
  const prefillButton = useRef<HTMLButtonElement>(null)
  const focusAfterReview = useRef<PrefillField | "all" | null>(null)
  // The latest form, for a Prefill answer that arrives after edits.
  const latest = useRef({ values, review, slugFollows })

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline)
  const uploading = uploads.some((upload) => upload.status === "uploading")
  const pending = Object.keys(review.fields).length + review.photos.length
  const link = values.manufacturer_url.trim()
  const linkReady = !!link && manufacturerUrl.safeParse(link).success
  const linkState =
    linkReady && linkCheck?.url === link ? linkCheck.state : null
  // A page that refused the check may still let Tune read it.
  const canPrefill =
    (linkState === "ok" || linkState === "blocked") &&
    pending === 0 &&
    review.url !== link

  useEffect(() => {
    latest.current = { values, review, slugFollows }
  })

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

  // Tune's suggestions waiting for review are kept with that work.
  useEffect(() => {
    if (!storageKey) return
    if (dirty && (pending > 0 || review.url)) {
      window.sessionStorage.setItem(
        reviewKey(storageKey),
        JSON.stringify(review)
      )
    } else {
      window.sessionStorage.removeItem(reviewKey(storageKey))
    }
  }, [storageKey, review, dirty, pending])

  // After a failed Save, focus the first marked field.
  useEffect(() => {
    if (!focusError.current) return
    focusError.current = false
    form.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus()
  }, [errors])

  // Accepting or rejecting removes the buttons that had focus: hand it to
  // the field (or, after Accept all or Reject all, to Prefill or the link).
  useEffect(() => {
    const target = focusAfterReview.current
    if (!target) return
    focusAfterReview.current = null
    const root = form.current
    if (!root) return
    if (target === "all") {
      ;(
        prefillButton.current ??
        root.querySelector<HTMLElement>(`[data-review-link] input`)
      )?.focus()
      return
    }
    const box = root.querySelector<HTMLElement>(`[data-review="${target}"]`)
    const control =
      box?.querySelector<HTMLElement>(
        "[data-slot='select-trigger'], input:not([aria-hidden='true']):not([tabindex='-1']), textarea"
      ) ?? box?.parentElement?.querySelector<HTMLElement>("button")
    control?.focus()
  }, [review])

  // Check the manufacturer's page once typing pauses: a HEAD request from
  // the server (see /api/admin/product-page/check), remembered per address.
  useEffect(() => {
    // A new address makes a Prefill under way pointless.
    if (prefillRequest.current && prefillFor.current !== link) {
      prefillRequest.current.abort()
    }
    if (!linkReady) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      const known = linkResults.current.get(link)
      if (known) {
        setLinkCheck({ url: link, state: known })
        return
      }
      setLinkCheck({ url: link, state: "checking" })
      try {
        const response = await fetch("/api/admin/product-page/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: link }),
          signal: controller.signal,
        })
        const result: unknown = await response.json().catch(() => null)
        if (controller.signal.aborted) return
        const status =
          response.ok &&
          result &&
          typeof result === "object" &&
          "status" in result &&
          typeof result.status === "string" &&
          LINK_STATES.has(result.status)
            ? (result.status as ProductPageStatus)
            : null
        if (status) linkResults.current.set(link, status)
        setLinkCheck({ url: link, state: status ?? "failed" })
      } catch {
        if (!controller.signal.aborted) {
          setLinkCheck({ url: link, state: "failed" })
        }
      }
    }, 500)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [link, linkReady])

  // A request from a closed/hidden editor must not update its draft later.
  useEffect(() => {
    const prefillRequests = prefillRequest
    return () => {
      cardLineRequest.current += 1
      prefillRequests.current?.abort()
    }
  }, [])

  /** The form without a field's review mark: the owner has taken it over. */
  const settle = (field: string) => {
    if (!(field in review.fields)) return
    setReview((current) => {
      const fields = { ...current.fields }
      delete fields[field as PrefillField]
      return { ...current, fields }
    })
  }

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
    settle(key)
    setValues((current) => ({
      ...current,
      [key]: value,
      ...(key === "name" && slugFollows && { slug: slugify(String(value)) }),
    }))
    const field =
      key === "price"
        ? "price_cents"
        : key === "msrp"
          ? "msrp_cents"
          : key.startsWith("sale_")
            ? "sale"
            : key
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

  const removePhoto = (index: number) => {
    const photo = values.images[index]
    setValues((current) => ({
      ...current,
      images: current.images.filter((_, at) => at !== index),
    }))
    if (photo && review.photos.includes(photo.path)) {
      setReview((current) => ({
        ...current,
        photos: current.photos.filter((path) => path !== photo.path),
      }))
    }
    // A staged upload nothing has saved yet; saved photos stay in storage.
    if (photo?.path.startsWith(UPLOADS)) {
      void discardUpload(photo.path).catch(() => {})
    }
  }

  const discardPhotos = (photos: { path: string }[]) => {
    for (const { path } of photos) {
      if (path.startsWith(UPLOADS)) void discardUpload(path).catch(() => {})
    }
  }

  /**
   * Puts Tune's suggestions into the form, each marked for review with the
   * value it replaced. Fields the owner changed while Tune was reading stay
   * theirs. New photos replace earlier suggested ones still waiting.
   */
  const applySuggestions = (
    suggestions: ProductSuggestions,
    before: ProductValues
  ) => {
    const {
      values: current,
      review: waiting,
      slugFollows: follows,
    } = latest.current
    const next: ProductValues = { ...current }
    const fields = { ...waiting.fields }
    const changed: PrefillField[] = []
    for (const field of PREFILL_FIELDS) {
      const value = suggestions[field]
      if (value === undefined || value === current[field]) continue
      if (current[field] !== before[field]) continue
      // Rejecting goes back to the owner's value, not an earlier suggestion.
      fields[field] ??= current[field]
      ;(next as Record<PrefillField, string>)[field] = value
      changed.push(field)
    }
    if (changed.includes("name") && follows) next.slug = slugify(next.name)

    let photos = waiting.photos
    const offered = suggestions.images ?? []
    if (offered.length > 0) {
      const stale = new Set(waiting.photos)
      const kept = current.images.filter(({ path }) => !stale.has(path))
      const room = Math.max(0, 20 - kept.length)
      const added = offered.slice(0, room)
      discardPhotos([
        ...current.images.filter(({ path }) => stale.has(path)),
        ...offered.slice(room),
      ])
      next.images = [...kept, ...added]
      photos = added.map(({ path }) => path)
    }

    cardLineRequest.current += 1
    setCardLineError(null)
    setValues(next)
    setReview({ fields, photos, url: before.manufacturer_url.trim() })
    setErrors((current) => {
      const rest = { ...current }
      for (const field of changed) {
        delete rest[field === "msrp" ? "msrp_cents" : field]
      }
      return rest
    })
    const filled = [
      changed.length > 0 &&
        `${changed.length} ${changed.length === 1 ? "field" : "fields"}`,
      offered.length > 0 &&
        `${photos.length} ${photos.length === 1 ? "photo" : "photos"}`,
    ].filter(Boolean)
    const note = filled.length
      ? `Tune filled in ${filled.join(" and ")}. Accept or reject each one.`
      : "Tune found nothing new on this page."
    setPrefillNote(note)
    return note
  }

  /**
   * Reading the page takes a while, and the owner may scroll on meanwhile:
   * if the address row is out of sight when Tune answers, a toast says so
   * and takes them back to it.
   */
  const announceIfAway = (note: string) => {
    const row = form.current?.querySelector<HTMLElement>("[data-review-link]")
    if (!row) return
    const observer = new IntersectionObserver(([entry]) => {
      observer.disconnect()
      if (!entry || entry.isIntersecting) return
      toast("success", {
        title: "Prefill ready",
        description: note,
        button: {
          title: "Review",
          onClick: () => {
            row.scrollIntoView({ block: "center" })
            row.querySelector("input")?.focus({ preventScroll: true })
          },
        },
      })
    })
    observer.observe(row)
  }

  /** Prefill with Tune: read the manufacturer's page and suggest fields. */
  const prefill = async () => {
    if (!canPrefill || prefilling) return
    prefillRequest.current?.abort()
    const controller = new AbortController()
    prefillRequest.current = controller
    const before = values
    const url = link
    prefillFor.current = url
    const waiting = new Set(review.photos)
    setPrefilling(true)
    setPrefillError(null)
    setPrefillNote("Tune is reading the page…")
    try {
      const response = await fetch("/api/admin/product-page/prefill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          // Photos waiting for review are replaced, so they don't count.
          photos: before.images.filter(({ path }) => !waiting.has(path)).length,
        }),
        signal: controller.signal,
      })
      const result = (await response.json().catch(() => null)) as {
        suggestions?: ProductSuggestions
        error?: string
      } | null
      const suggestions = response.ok ? result?.suggestions : undefined
      // Closed, or the address changed, while Tune was reading.
      if (
        controller.signal.aborted ||
        latest.current.values.manufacturer_url.trim() !== url
      ) {
        discardPhotos(suggestions?.images ?? [])
        return
      }
      if (!suggestions || typeof suggestions !== "object") {
        setPrefillNote("")
        setPrefillError(
          typeof result?.error === "string" ? result.error : PREFILL_FAILED
        )
        return
      }
      // The completed button disappears. Keep keyboard focus in the form
      // without interrupting an owner who moved on while Tune was reading.
      if (document.activeElement === prefillButton.current) {
        form.current
          ?.querySelector<HTMLInputElement>("[data-review-link] input")
          ?.focus()
      }
      announceIfAway(applySuggestions(suggestions, before))
    } catch {
      if (!controller.signal.aborted) {
        setPrefillNote("")
        setPrefillError(PREFILL_FAILED)
      }
    } finally {
      if (prefillRequest.current === controller) {
        prefillRequest.current = null
        setPrefilling(false)
      }
    }
  }

  const accept = (field: PrefillField) => {
    focusAfterReview.current = field
    settle(field)
  }

  const reject = (field: PrefillField) => {
    const previous = review.fields[field]
    if (previous === undefined) return
    focusAfterReview.current = field
    set(field, previous as ProductValues[PrefillField])
  }

  const acceptAll = () => {
    focusAfterReview.current = "all"
    setReview((current) => ({ ...NO_REVIEW, url: current.url }))
    setPrefillNote("Kept Tune’s suggestions.")
  }

  const rejectAll = () => {
    const { fields, photos } = review
    const suggested = new Set(photos)
    setValues((current) => {
      const next: ProductValues = { ...current }
      for (const field of PREFILL_FIELDS) {
        const previous = fields[field]
        if (previous !== undefined) {
          ;(next as Record<PrefillField, string>)[field] = previous
        }
      }
      if ("name" in fields && slugFollows) next.slug = slugify(next.name)
      next.images = current.images.filter(({ path }) => !suggested.has(path))
      return next
    })
    discardPhotos(values.images.filter(({ path }) => suggested.has(path)))
    cardLineRequest.current += 1
    setCardLineError(null)
    focusAfterReview.current = "all"
    setReview(NO_REVIEW)
    setPrefillNote("Removed Tune’s suggestions.")
  }

  // Unsaved work, and its review marks, once saved or discarded.
  const forget = () => {
    if (!storageKey) return
    window.sessionStorage.removeItem(storageKey)
    window.sessionStorage.removeItem(baseKey(storageKey))
    window.sessionStorage.removeItem(reviewKey(storageKey))
  }

  const candidate = inputFromValues(values, baseline)
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
    // A sale must cost less than the regular price (the database checks it
    // too); a sale left as it was isn't sent, so it isn't checked here.
    const saleTooHigh =
      parsed.success &&
      !!parsed.data.sale &&
      (parsed.data.price_cents === null ||
        parsed.data.sale.price_cents >= parsed.data.price_cents)
    if (!parsed.success || saleTooHigh) {
      const marked: Record<string, string> = {}
      for (const issue of parsed.error?.issues ?? []) {
        const field = String(issue.path[0] ?? "")
        marked[field] ??= PROBLEMS[field] ?? issue.message
      }
      if (saleTooHigh) marked.sale = PROBLEMS.sale
      focusError.current = true
      // Show the fields that need fixing.
      if (marked.short_description) setEditingCard(true)
      if (marked.description) setShowDescription(false)
      setErrors(marked)
      setMessage("Check the marked fields.")
      return
    }
    const input = parsed.data
    // A saved product writes only what changed here, so changes made
    // elsewhere since it opened (by Tune, say) stay.
    const started = inputFromValues(baseline)
    const fields = input.id
      ? changedInputFields(
          input,
          productInputSchema.safeParse(started).data ?? started
        )
      : undefined
    setMessage(null)
    startSaving(async () => {
      const result = await saveProductFromEditor(input, fields)
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
      forget()
      // Saved: the product exists now, and its photos have their final paths.
      // Suggestions still marked were saved as they stood: accepted.
      const next: ProductValues = {
        ...values,
        id: result.id,
        slug: result.slug,
        status: input.status,
        short_description: result.short_description,
        images: input.images.map((image, index) => ({
          ...image,
          path: result.images[index] ?? image.path,
        })),
      }
      setValues(next)
      setBaseline(next)
      setReview(NO_REVIEW)
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
      {errors[name] && (
        <span id={`${fieldId(name)}-problem`} className={styles.problem}>
          {errors[name]}
        </span>
      )}
    </div>
  )
  // A control Prefill with Tune can fill. While its suggestion waits, a
  // dashed edge marks it, with Accept and Reject inside. The wrapper is
  // always there, so the control never remounts (and keeps focus) when the
  // mark comes or goes.
  const suggested = (
    name: PrefillField,
    control: ReactNode,
    multiline = false
  ) => {
    const waiting = name in review.fields
    return (
      <div
        className={styles.suggestion}
        data-review={name}
        data-suggested={waiting || undefined}
        data-multiline={multiline || undefined}
      >
        {control}
        {waiting && (
          <span className={styles.reviewButtons}>
            <button
              type="button"
              aria-label={`Accept Tune’s ${REVIEW_LABELS[name]}`}
              title="Accept"
              disabled={saving}
              onClick={() => accept(name)}
            >
              <Check size={15} strokeWidth={2.25} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={`Reject Tune’s ${REVIEW_LABELS[name]}`}
              title="Reject"
              disabled={saving}
              onClick={() => reject(name)}
            >
              <X size={15} strokeWidth={2.25} aria-hidden="true" />
            </button>
          </span>
        )}
      </div>
    )
  }

  // The preview shows the sale too, even one Save leaves as it is.
  const shown = previewOpen
    ? productInputSchema.safeParse(inputFromValues(values))
    : null
  const preview = shown?.success ? productFromInput(shown.data, taxonomy) : null

  // Where the sale stands, beside its label.
  const now = toStoreDateTime(new Date())
  const saleNote =
    values.sale_price.trim() && values.sale_ends
      ? values.sale_ends <= now
        ? "Ended"
        : values.sale_starts && values.sale_starts > now
          ? "Upcoming"
          : "On sale now"
      : null
  const removeSale = () => {
    setSaleEnabled(false)
    saleToggle.current?.focus()
    setValues((current) => ({
      ...current,
      sale_price: "",
      sale_starts: "",
      sale_ends: "",
    }))
    setErrors((current) => {
      const rest = { ...current }
      delete rest.sale
      return rest
    })
  }

  const used = isUsedEquipment(values.category_slug, values.condition)
  const sold = used && values.availability === "sold"
  // The condition note holds used gear's score (the slider under the
  // condition pills) and any other terms (the notes field).
  const conditionNote = values.condition_note ?? ""
  const notes = conditionNotes(conditionNote)
  const useListPrice =
    !values.price.trim() &&
    isOrderableAvailability(values.availability) &&
    parseDollars(values.msrp) > 0

  return (
    <div
      ref={form}
      className={[styles.editor, stickyActions && styles.sheetEditor]
        .filter(Boolean)
        .join(" ")}
    >
      <motion.div layoutScroll={stickyActions} className={styles.editorContent}>
        {/* The product's place in the shop, first, like a table's filters. */}
        <div className={styles.facets}>
          {field(
            "category_slug",
            "Category",
            suggested(
              "category_slug",
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
            )
          )}
          {field(
            "brand_slug",
            "Brand",
            suggested(
              "brand_slug",
              <Choice
                value={values.brand_slug}
                placeholder="Choose…"
                options={[
                  { value: "", label: "No brand", first: true },
                  ...taxonomy.brands.map(({ slug, name }) => ({
                    value: slug,
                    label: name,
                  })),
                ]}
                onChange={(value) => set("brand_slug", value)}
                aria-labelledby={`${fieldId("brand_slug")}-label`}
                {...invalid("brand_slug")}
              />
            )
          )}
          <fieldset className={`${styles.segmented} ${styles.conditionField}`}>
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
            {/* Used gear's score slides out from under the pills into the
              free space below them. */}
            <AnimatePresence initial={false}>
              {used && (
                <motion.div
                  key="score"
                  className={styles.scorePanel}
                  initial={{ opacity: 0, y: still ? 0 : -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: still ? 0 : -10 }}
                  transition={{ duration: still ? 0 : 0.2, ease: "easeOut" }}
                >
                  <ScoreSlider
                    value={conditionScore(conditionNote)}
                    tone={values.condition.toLowerCase()}
                    disabled={disabled || saving}
                    aria-label="Condition score"
                    onChange={(score) =>
                      set(
                        "condition_note",
                        withConditionScore(conditionNote, score)
                      )
                    }
                  />
                </motion.div>
              )}
            </AnimatePresence>
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
                    checked={(sold ? "draft" : values.status) === status.value}
                    disabled={sold && status.value === "published"}
                    onChange={() => set("status", status.value)}
                  />
                  <span>{status.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {/* Once the manufacturer's page answers, Tune can read it and fill
            in the form for review. */}
          <div className={styles.linkRow}>
            {field(
              "manufacturer_url",
              <>
                Manufacturer page
                {linkState && LINK_NOTES[linkState] && (
                  <span className={styles.aside}>{LINK_NOTES[linkState]}</span>
                )}
              </>,
              <span
                className={styles.linkInput}
                data-review-link
                data-state={linkState ?? undefined}
              >
                <input
                  type="url"
                  value={values.manufacturer_url}
                  placeholder="https://"
                  onChange={(event) =>
                    set("manufacturer_url", event.target.value)
                  }
                  {...invalid("manufacturer_url")}
                />
                {linkState === "checking" && (
                  <LoaderCircle
                    className={`${styles.linkState} ${styles.spin}`}
                    size={16}
                    aria-hidden="true"
                  />
                )}
                {linkState === "ok" && (
                  <CircleCheck
                    className={styles.linkState}
                    size={18}
                    aria-hidden="true"
                  />
                )}
              </span>,
              styles.linkField
            )}
            {canPrefill && (
              <HaloButton
                ref={prefillButton}
                type="button"
                className={styles.prefill}
                idleClassName={`${adminStyles.secondary} ${styles.prefill}`}
                buttonClassName={styles.tuneLoading}
                isLoading={prefilling}
                loadingText="Prefilling…"
                disabled={disabled || saving || writingCard || prefilling}
                onClick={prefill}
              >
                <WandSparkles size={15} aria-hidden="true" />
                Prefill with Tune
              </HaloButton>
            )}
            {prefillError && (
              <p className={`${styles.problem} ${styles.rowNote}`} role="alert">
                {prefillError}
              </p>
            )}
            <span className="sr-only" role="status">
              {linkAnnouncement(linkState)}
            </span>
            <span className="sr-only" role="status">
              {prefillNote}
            </span>
          </div>
        </div>

        <section className={styles.photos} aria-labelledby={fieldId("photos")}>
          <h3 id={fieldId("photos")} className={styles.label}>
            Photos
            <span className={styles.aside}>The first is the cover</span>
          </h3>
          {values.images.length > 0 && (
            <ProductPhotos
              images={values.images}
              onChange={(images) => set("images", images)}
              onRemove={removePhoto}
              suggested={review.photos}
              onAccept={(path) =>
                setReview((current) => ({
                  ...current,
                  photos: current.photos.filter((item) => item !== path),
                }))
              }
            />
          )}
          <UploadDropzone
            maxBytes={PHOTO_MAX_BYTES}
            onFiles={upload}
            uploads={uploads}
            split
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
            suggested(
              "name",
              <input
                type="text"
                value={values.name}
                maxLength={160}
                onChange={(event) => set("name", event.target.value)}
                {...invalid("name")}
              />
            ),
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
            "availability",
            "Availability",
            <Choice
              value={values.availability}
              options={PRODUCT_AVAILABILITY_OPTIONS}
              onChange={(value) =>
                set("availability", value as ProductValues["availability"])
              }
              aria-labelledby={`${fieldId("availability")}-label`}
            />
          )}
          {(used || notes) &&
            field(
              "condition_note",
              "Condition notes",
              <input
                type="text"
                value={notes}
                maxLength={500 - (conditionNote.length - notes.length)}
                onChange={(event) =>
                  set(
                    "condition_note",
                    withConditionNotes(conditionNote, event.target.value)
                  )
                }
                {...invalid("condition_note")}
              />
            )}
          <div className={`${styles.pricing} ${styles.full}`}>
            {field(
              "price_cents",
              <>
                Selling price{" "}
                <span className={styles.aside}>Blank for price on request</span>
              </>,
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
              </span>,
              undefined,
              <button
                ref={saleToggle}
                type="button"
                className={styles.saleToggle}
                data-live={saleNote === "On sale now" || undefined}
                title={saleEnabled ? "Remove sale" : "Add sale"}
                aria-pressed={saleEnabled}
                aria-expanded={saleEnabled}
                aria-controls={fieldId("sale-fields")}
                disabled={disabled || saving}
                onClick={() =>
                  saleEnabled ? removeSale() : setSaleEnabled(true)
                }
              >
                <BadgePercent size={15} aria-hidden="true" />
                Sale
              </button>
            )}
            {field(
              "msrp_cents",
              <>
                List price{" "}
                <span className={styles.aside}>Manufacturer MSRP</span>
              </>,
              suggested(
                "msrp",
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
              ),
              undefined,
              useListPrice && (
                <button
                  type="button"
                  className={styles.saleToggle}
                  disabled={disabled || saving}
                  onClick={() => set("price", values.msrp)}
                >
                  Use as selling price
                </button>
              )
            )}
            {field(
              "price_unit",
              "Sold",
              suggested(
                "price_unit",
                <Choice
                  value={values.price_unit}
                  options={UNITS}
                  onChange={(value) =>
                    set("price_unit", value as "each" | "pair")
                  }
                  aria-labelledby={`${fieldId("price_unit")}-label`}
                  {...invalid("price_unit")}
                />
              )
            )}
            {field(
              "ready_for_audition",
              "Ready for audition",
              <button
                type="button"
                role="switch"
                className={styles.auditionToggle}
                aria-checked={values.ready_for_audition}
                aria-labelledby={`${fieldId("ready_for_audition")}-label`}
                disabled={disabled || saving}
                onClick={() =>
                  set("ready_for_audition", !values.ready_for_audition)
                }
                {...invalid("ready_for_audition")}
              >
                <svg
                  width="28"
                  height="24"
                  viewBox="0 0 32 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="16" cy="7" r="3" />
                  <path d="M9 21v-1a7 7 0 0 1 14 0v1" />
                  {values.ready_for_audition ? (
                    <path d="M8 5a4 4 0 0 0 0 5M4 2a8 8 0 0 0 0 11M24 5a4 4 0 0 1 0 5M28 2a8 8 0 0 1 0 11" />
                  ) : (
                    <path d="m4 3 24 18" />
                  )}
                </svg>
                <span aria-hidden="true">
                  {values.ready_for_audition ? "On" : "Off"}
                </span>
              </button>,
              styles.auditionField
            )}
          </div>
          {/* Dates appear once there is a sale price; a saved sale opens here. */}
          <div
            id={fieldId("sale-fields")}
            className={`${styles.full} ${styles.saleFields}`}
            hidden={!saleEnabled}
          >
            {saleEnabled && (
              <div className={styles.pricing}>
                {field(
                  "sale",
                  <>
                    Sale price
                    <span className={styles.aside}>
                      {saleNote ?? "Optional"}
                    </span>
                  </>,
                  <span className={styles.affix}>
                    <span aria-hidden="true">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={values.sale_price}
                      onChange={(event) =>
                        set("sale_price", event.target.value)
                      }
                      {...invalid("sale")}
                    />
                  </span>
                )}
                {values.sale_price.trim() && (
                  <motion.div
                    className={styles.saleDates}
                    initial={{ opacity: 0, y: still ? 0 : -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: still ? 0 : 0.18 }}
                  >
                    {field(
                      "sale_dates",
                      <>
                        Sale dates{" "}
                        <span className={styles.aside}>Store time</span>
                      </>,
                      <SaleDateRange
                        start={values.sale_starts}
                        end={values.sale_ends}
                        disabled={disabled || saving}
                        id={fieldId("sale_dates")}
                        onChange={({ start, end }) =>
                          setValues((current) => ({
                            ...current,
                            sale_starts: start,
                            sale_ends: end,
                          }))
                        }
                      />
                    )}
                    <button
                      type="button"
                      className={`${styles.editCard} ${styles.endSale}`}
                      disabled={disabled || saving}
                      onClick={removeSale}
                    >
                      Remove sale
                    </button>
                  </motion.div>
                )}
              </div>
            )}
          </div>
          {field(
            "description",
            "Product Description",
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
              {suggested(
                "description",
                showDescription ? (
                  values.description.trim() ? (
                    <MarkdownText
                      className={styles.markdownPreview}
                      text={values.description}
                    />
                  ) : (
                    <p className={styles.markdownPreview}>
                      Nothing written yet.
                    </p>
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
                ),
                true
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
                  {values.short_description.length}/1000
                </span>
              )}
            </span>
            {suggested(
              "short_description",
              editingCard ? (
                <textarea
                  rows={2}
                  value={values.short_description}
                  aria-labelledby={`${fieldId("short_description")}-label`}
                  onChange={(event) =>
                    set("short_description", event.target.value)
                  }
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
              ),
              true
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
              {(writingCard ||
                (!values.short_description.trim() &&
                  cardLineInput.success)) && (
                <HaloButton
                  type="button"
                  idleClassName={adminStyles.secondary}
                  buttonClassName={styles.tuneLoading}
                  isLoading={writingCard}
                  loadingText="Writing…"
                  disabled={disabled || saving || writingCard || prefilling}
                  onClick={writeCard}
                >
                  <WandSparkles size={15} aria-hidden="true" />
                  Let Tune write it
                </HaloButton>
              )}
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
            </div>
            {cardLineError && (
              <p className={styles.problem} role="alert">
                {cardLineError}
              </p>
            )}
          </div>
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
      </motion.div>
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
            prefilling ||
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
              // Discarding drops the work kept for this product, and the
              // photos Tune staged that nobody accepted.
              forget()
              discardPhotos(
                values.images.filter(({ path }) => review.photos.includes(path))
              )
              onCancel()
            }}
          >
            {dirty ? "Discard" : "Close"}
          </button>
        )}
        {pending > 0 && (
          <div
            className={styles.reviewAll}
            role="group"
            aria-label="Tune’s suggestions"
          >
            <span>
              <WandSparkles size={14} aria-hidden="true" />
              {pending} to review
            </span>
            <button type="button" disabled={saving} onClick={acceptAll}>
              <Check size={14} strokeWidth={2.25} aria-hidden="true" />
              Accept all
            </button>
            <button type="button" disabled={saving} onClick={rejectAll}>
              <X size={14} strokeWidth={2.25} aria-hidden="true" />
              Reject all
            </button>
          </div>
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
