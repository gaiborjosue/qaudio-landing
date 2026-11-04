"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Image from "next/image"
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
import { prepareMetadataImage } from "@/lib/admin/metadata-upload"
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
  const [dark, setDark] = useState(false)
  const request = useRef<AbortController | null>(null)
  const lastFile = useRef<File | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const upload = async (file: File, invert = dark) => {
    if (file.size > METADATA_SOURCE_MAX) {
      setError("Use an image under 20 MB.")
      return
    }
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    lastFile.current = file
    setUploading(true)
    setError(null)
    onBusy(1)
    try {
      const blob = await prepareMetadataImage(file, kind)
      if (controller.signal.aborted) return
      const response = await fetch(
        `/api/admin/metadata/image?kind=${kind}&tone=${invert ? "dark" : "light"}`,
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
      onChange(result.path)
      // Only staged files can be discarded; published images stay available.
      if (path.startsWith("uploads/")) void discardUpload(path).catch(() => {})
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
  return (
    <div className={styles.imageField}>
      <span className={styles.label}>{label}</span>
      {path && (
        <div className={styles.imagePreviews}>
          <div
            className={
              kind === "logo" ? styles.darkPreview : styles.imagePreview
            }
          >
            <Image
              src={catalogAssetUrl(path)}
              alt={label}
              fill
              sizes="280px"
              className={kind === "scene" ? styles.scene : styles.art}
            />
          </div>
          {kind === "logo" && (
            <div className={styles.imagePreview}>
              <Image
                src={catalogAssetUrl(path)}
                alt="Logo on the shop’s light background"
                fill
                sizes="280px"
                className={`${styles.art} ${styles.logoOnLight}`}
              />
            </div>
          )}
        </div>
      )}
      {kind === "logo" && (
        <label className={styles.invert}>
          <input
            type="checkbox"
            checked={dark}
            disabled={uploading}
            onChange={(event) => {
              setDark(event.target.checked)
              if (lastFile.current)
                void upload(lastFile.current, event.target.checked)
            }}
          />
          Dark artwork (invert on upload)
        </label>
      )}
      <input
        type="file"
        aria-label={`${path ? "Replace" : "Upload"} ${label.toLowerCase()}`}
        accept="image/png,image/jpeg,image/webp,image/avif"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
          event.target.value = ""
        }}
      />
      <span role="status" className={styles.hint}>
        {uploading ? "Uploading…" : "PNG, JPEG, WebP, or AVIF · up to 20 MB"}
      </span>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
