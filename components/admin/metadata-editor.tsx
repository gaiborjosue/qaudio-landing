"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type DragEvent,
} from "react"
import Image from "next/image"
import { Contrast, ImagePlus, ImageUp, LoaderCircle } from "lucide-react"
import { FileBrowseButton } from "@/components/ui/file-browse-button"
import { saveMetadataFromEditor } from "@/app/admin/metadata/actions"
import { catalogAssetUrl } from "@/lib/catalog-assets"
import {
  METADATA_SOURCE_MAX,
  metadataInput,
  type MetadataImageKind,
  type MetadataKind,
  type MetadataRow,
} from "@/lib/admin/metadata"
import { discardUpload } from "@/lib/admin/photo-upload"
import { slugify } from "@/lib/admin/product-editor"
import {
  prepareMetadataImage,
  type LogoTone,
} from "@/lib/admin/metadata-upload"
import admin from "./admin.module.css"
import styles from "./metadata.module.css"

export type MetadataDraft = {
  kind: MetadataKind
  original_slug?: string
  slug: string
  name: string
  wheel_label: string
  artwork_path: string
  scene_path: string
  logo_path: string
}

export type MetadataDraftChange =
  MetadataDraft | ((current: MetadataDraft) => MetadataDraft)

export function metadataDraft(
  kind: MetadataKind,
  row?: MetadataRow
): MetadataDraft {
  return {
    kind,
    original_slug: row?.slug,
    slug: row?.slug ?? "",
    name: row?.name ?? "",
    wheel_label: row?.wheel_label ?? "",
    artwork_path: row?.artwork_path ?? "",
    scene_path: row?.scene_path ?? "",
    logo_path: row?.logo_path ?? "",
  }
}

export function MetadataEditor({
  draft,
  onChange,
  onSaved,
  onDiscard,
}: {
  draft: MetadataDraft
  onChange: (draft: MetadataDraftChange) => void
  onSaved: () => void
  onDiscard: () => void
}) {
  const [saving, startSaving] = useTransition()
  const [uploading, setUploading] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)
  const valid = metadataInput.safeParse(draft).success
  const field = (key: keyof MetadataDraft, value: string) =>
    onChange((current) => ({ ...current, [key]: value }))
  return (
    <form
      ref={form}
      className={styles.editor}
      onSubmit={(event) => {
        event.preventDefault()
        if (!valid || saving || uploading) return
        setError(null)
        startSaving(async () => {
          try {
            const result = await saveMetadataFromEditor(draft)
            if ("error" in result) {
              setError(result.error)
              return
            }
            onSaved()
          } catch {
            setError("Couldn’t save this entry. Try again.")
          }
        })
      }}
    >
      <fieldset className={styles.fields} disabled={saving}>
        <label>
          Name
          <input
            value={draft.name}
            maxLength={120}
            required
            onChange={(event) => {
              const name = event.target.value
              onChange((current) => ({
                ...current,
                name,
                ...(!current.original_slug &&
                  (!current.slug || current.slug === slugify(current.name)) && {
                    slug: slugify(name),
                  }),
              }))
            }}
          />
        </label>
        <label>
          Address
          <input
            value={draft.slug}
            maxLength={120}
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            readOnly={!!draft.original_slug}
            onChange={(event) => field("slug", event.target.value)}
            aria-describedby="metadata-address-hint"
          />
          <span id="metadata-address-hint" className={styles.hint}>
            {draft.kind === "categories"
              ? `/shop/${draft.slug}`
              : `/shop?brand=${draft.slug}`}
            {draft.original_slug ? " · fixed after creation" : ""}
          </span>
        </label>
        {draft.kind === "categories" && (
          <label>
            Wheel label
            <input
              value={draft.wheel_label}
              maxLength={40}
              required
              onChange={(event) => field("wheel_label", event.target.value)}
            />
          </label>
        )}
        <div className={styles.images}>
          {draft.kind === "categories" ? (
            <>
              <MetadataImage
                kind="icon"
                label="Category icon"
                path={draft.artwork_path}
                onChange={(path) => field("artwork_path", path)}
                onBusy={(delta) => setUploading((count) => count + delta)}
              />
              <MetadataImage
                kind="scene"
                label="Background photo"
                path={draft.scene_path}
                onChange={(path) => field("scene_path", path)}
                onBusy={(delta) => setUploading((count) => count + delta)}
              />
            </>
          ) : (
            <MetadataImage
              kind="logo"
              label="Brand logo"
              path={draft.logo_path}
              onChange={(path) => field("logo_path", path)}
              onBusy={(delta) => setUploading((count) => count + delta)}
            />
          )}
        </div>
      </fieldset>
      <div className={styles.editorActions}>
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <button
          type="button"
          className={admin.secondary}
          disabled={saving || uploading > 0}
          onClick={onDiscard}
        >
          Discard
        </button>
        <button
          type="submit"
          className={admin.primary}
          disabled={!valid || saving || uploading > 0}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  )
}

/** What the upload takes, under the empty tile and on Replace. */
const SOURCES = "PNG, JPEG, WebP, or AVIF · up to 20 MB"

/** An image ready to send, and for a logo, the tone it's sent as. */
type Prepared = { blob: Blob; tone: LogoTone | null }

/**
 * One artwork field. Empty, it's the attach tile; with an image, it's the
 * image, with Replace over its corner on hover or focus (always on touch
 * screens). A file dropped on either takes its place. A logo is read as
 * light or dark artwork when it's chosen, and sent so it lands light on
 * black, as the site keeps logos; when that read is wrong, Invert sends the
 * same file the other way. Saved logos have no file here to send again, so
 * Invert shows only for one chosen in this sheet.
 */
function MetadataImage({
  kind,
  label,
  path,
  onChange,
  onBusy,
}: {
  kind: MetadataImageKind
  label: string
  path: string
  onChange: (path: string) => void
  onBusy: (delta: number) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [source, setSource] = useState<{ blob: Blob; tone: LogoTone } | null>(
    null
  )
  const input = useRef<HTMLInputElement>(null)
  const tile = useRef<HTMLButtonElement>(null)
  const replace = useRef<HTMLButtonElement>(null)
  const refocus = useRef(false)
  const labelId = useId()
  const hintId = useId()
  const request = useRef<AbortController | null>(null)
  const name = label.toLowerCase()
  useEffect(() => () => request.current?.abort(), [])
  // The tile's upload replaces the tile, so its focus moves to Replace, and
  // the image's actions show while it's there.
  useEffect(() => {
    if (!path || !refocus.current) return
    refocus.current = false
    replace.current?.focus()
  }, [path])

  const upload = async (prepare: () => Promise<Prepared>) => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setUploading(true)
    setError(null)
    onBusy(1)
    try {
      const { blob, tone } = await prepare()
      if (controller.signal.aborted) return
      const response = await fetch(
        `/api/admin/metadata/image?kind=${kind}&tone=${tone === "dark" ? "dark" : "light"}`,
        {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
          signal: controller.signal,
        }
      )
      const result = await response.json()
      if (
        !response.ok ||
        typeof result.path !== "string" ||
        !/^uploads\/[0-9a-f-]{36}\.webp$/.test(result.path)
      )
        throw new Error(result.error ?? "Couldn’t upload the image.")
      if (controller.signal.aborted) {
        void discardUpload(result.path).catch(() => {})
        return
      }
      const focused = document.activeElement
      refocus.current =
        !focused || focused === document.body || focused === tile.current
      onChange(result.path)
      // Only staged files can be discarded; published images stay available.
      if (path.startsWith("uploads/")) void discardUpload(path).catch(() => {})
      setSource(kind === "logo" && tone ? { blob, tone } : null)
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "Couldn’t upload the image."
        )
    } finally {
      onBusy(-1)
      if (request.current === controller) {
        request.current = null
        setUploading(false)
      }
    }
  }

  const choose = (file: File | undefined) => {
    if (!file || uploading) return
    if (file.size > METADATA_SOURCE_MAX) {
      setError("Use an image under 20 MB.")
      return
    }
    void upload(() => prepareMetadataImage(file, kind))
  }
  const invert = () => {
    if (!source || uploading) return
    const tone: LogoTone = source.tone === "dark" ? "light" : "dark"
    void upload(async () => ({ blob: source.blob, tone }))
  }
  // aria-disabled rather than disabled while uploading, so the button
  // keeps focus.
  const browse = () => {
    if (!uploading) input.current?.click()
  }

  // A file dragged over the image or the tile lights it, and dropping it
  // there chooses it.
  const files = (event: DragEvent) => event.dataTransfer.types.includes("Files")
  const drop = {
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!files(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = uploading ? "none" : "copy"
      setOver(true)
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null))
        setOver(false)
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!files(event)) return
      event.preventDefault()
      setOver(false)
      choose(event.dataTransfer.files[0])
    },
  }

  return (
    <div className={styles.imageField} role="group" aria-labelledby={labelId}>
      <span id={labelId}>{label}</span>
      {path ? (
        <div
          className={styles.imageFrame}
          data-kind={kind}
          data-busy={uploading || undefined}
          data-over={over || undefined}
          {...drop}
        >
          <Image
            src={catalogAssetUrl(path)}
            alt={label}
            fill
            sizes="(max-width: 640px) 100vw, 600px"
            className={styles[kind]}
          />
          {uploading && (
            <span className={styles.imageStatus} aria-hidden="true">
              <LoaderCircle size={14} strokeWidth={2} className={styles.spin} />
              Uploading…
            </span>
          )}
          <div className={styles.imageActions}>
            {source && (
              <button
                type="button"
                className={styles.imageAction}
                aria-disabled={uploading}
                aria-label={`Invert ${name} colors`}
                onClick={invert}
              >
                <Contrast size={14} strokeWidth={2} aria-hidden="true" />
                Invert
              </button>
            )}
            <button
              ref={replace}
              type="button"
              className={styles.imageAction}
              aria-disabled={uploading}
              aria-label={`Replace ${name}`}
              aria-describedby={hintId}
              onClick={browse}
            >
              <ImageUp size={14} strokeWidth={2} aria-hidden="true" />
              Replace
            </button>
          </div>
        </div>
      ) : (
        <div className="upl" {...drop}>
          <FileBrowseButton
            ref={tile}
            className={styles.imageBrowse}
            icon={ImagePlus}
            note={SOURCES}
            data-over={over || undefined}
            aria-disabled={uploading}
            aria-busy={uploading}
            aria-label={
              uploading ? `Uploading ${name}` : `Choose image for ${name}`
            }
            aria-describedby={hintId}
            onClick={browse}
          >
            {uploading ? "Uploading…" : "Choose image"}
          </FileBrowseButton>
        </div>
      )}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif"
        hidden
        onChange={(event) => {
          choose(event.target.files?.[0])
          event.target.value = ""
        }}
      />
      <span id={hintId} className="visually-hidden">
        {SOURCES}
      </span>
      <span className="visually-hidden" role="status">
        {uploading ? `Uploading ${name}…` : ""}
      </span>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
