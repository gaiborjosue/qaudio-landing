"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { applyImageEdit } from "@/app/admin/image-edit-actions"
import { CHAT_BUCKET } from "@/lib/admin/media-lifecycle"
import { formatCost } from "@/lib/admin/response-usage"
import type { StoryEditInput } from "@/lib/admin/story-edits"
import type { StoryImage } from "@/lib/admin/story-images"
import { browserSupabase } from "@/lib/supabase/browser"
import { StoryEditor } from "./story-editor"
import styles from "./admin.module.css"

export function ImageEditDialog({
  image,
  onClose,
}: {
  image: StoryImage
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const versionPicker = useRef<HTMLSelectElement>(null)
  const focusVersions = useRef(false)
  const [versions, setVersions] = useState<
    { image: StoryImage; cost: number | null }[]
  >([])
  const [selected, setSelected] = useState(0)
  const [applying, setApplying] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState(false)
  const version = versions[selected - 1]
  const selectedImage = version?.image ?? image
  const pending = applying || downloading

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    return () => element.close()
  }, [])

  useEffect(() => {
    if (!focusVersions.current) return
    focusVersions.current = false
    versionPicker.current?.focus()
  }, [versions.length])

  const apply = async (input: StoryEditInput) => {
    setApplying(true)
    setDownloadError(false)
    try {
      const result = await applyImageEdit(input)
      if ("problem" in result) {
        return result.cost === undefined
          ? result.problem
          : `${result.problem} Edit cost: ${formatCost(result.cost)}.`
      }
      focusVersions.current = true
      setVersions([...versions, result])
      setSelected(versions.length + 1)
    } finally {
      setApplying(false)
    }
  }

  const download = async () => {
    if (!version || downloading) return
    setDownloading(true)
    setDownloadError(false)
    try {
      const { data, error } = await browserSupabase()
        .storage.from(CHAT_BUCKET)
        .download(version.image.path)
      if (error || !data) throw new Error("Download unavailable")
      const url = URL.createObjectURL(data)
      const link = document.createElement("a")
      link.href = url
      link.download = `qaudio-edited-image-${selected}.jpg`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setDownloadError(true)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      className={`${styles.storyViewer} ${styles.storyEditing}`}
      aria-label="Edit uploaded image"
      onCancel={(event) => {
        event.preventDefault()
        if (!pending) onClose()
      }}
    >
      <div className={styles.storyViewerBar}>
        <span className={styles.storyViewerTitle}>Edit image</span>
        {versions.length > 0 && (
          <select
            ref={versionPicker}
            className={styles.imageEditVersion}
            aria-label="Image version"
            value={selected}
            disabled={pending}
            onChange={(event) => {
              setSelected(Number(event.target.value))
              setDownloadError(false)
            }}
          >
            <option value={0}>Original</option>
            {versions.map(({ image }, index) => (
              <option key={image.path} value={index + 1}>
                Edit {index + 1}
              </option>
            ))}
          </select>
        )}
        {version && (
          <>
            <span className={styles.imageEditCost}>
              Edit cost: {formatCost(version.cost)}
            </span>
            <button
              type="button"
              className={styles.storyViewerButton}
              disabled={pending}
              onClick={() => void download()}
            >
              {downloading ? "Downloading…" : "Download JPEG"}
            </button>
          </>
        )}
        {downloadError && (
          <span className={styles.imageEditCost} role="alert">
            Download failed. Try again.
          </span>
        )}
        <button
          type="button"
          className={styles.storyViewerIcon}
          aria-label="Close image editor"
          disabled={pending}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
        <span className="visually-hidden" role="status">
          {applying ? "Editing image…" : ""}
        </span>
      </div>
      <StoryEditor
        key={selectedImage.path}
        image={selectedImage}
        photo
        disabled={downloading}
        onApply={apply}
      />
    </dialog>
  )
}
