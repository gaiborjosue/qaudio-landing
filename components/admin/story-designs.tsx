"use client"

import { memo, useEffect, useRef, useState } from "react"
import { Maximize2, Pencil, X } from "lucide-react"
import type { EveToolPart } from "eve/react"
import { AsciiWake } from "@/components/ascii-wake"
import type { ChatActions } from "./chat-actions"
import { StoryEditor } from "./story-editor"
import { storyProgress, type StoryImage } from "@/lib/admin/story-images"
import { mediaUrl } from "@/lib/media"
import styles from "./admin.module.css"

/** The design_story tool's name (agent/tools/design_story.ts). */
export const STORY_TOOL = "design_story"
export const isStoryTool = (name: string) =>
  name === STORY_TOOL || name === "edit_story"

// The placeholder's size: Instagram's 9:16, in the chat.
const FRAME_W = 180
const FRAME_H = 320

type Output = {
  status?: string
  started_at?: number
  images?: StoryImage[]
  design?: StoryImage
  /** Older chats: the design picked from two. */
  chosen?: StoryImage
  problem?: string
  review?: string
}

/** The estimated share done, re-read four times a second while designing. */
function useProgress(startedAt: number | undefined, running: boolean) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [running])
  if (!startedAt) return 0
  return storyProgress((now - startedAt) / 1000)
}

/**
 * The story design, in the chat: while the image model works, a 9:16
 * placeholder whose whole ground is Bencho's ASCII wake to play with, the
 * estimated progress over it; then the design itself, in color (it's what
 * will be posted), with a button at its top right to see it large. The
 * owner can edit it or Continue to the story's separate approval card.
 */
export const StoryDesigns = memo(function StoryDesigns({
  part,
  actions,
}: {
  part: EveToolPart
  actions: ChatActions
}) {
  const editing = part.name === "edit_story"
  const output = (part.output ?? {}) as Output
  const design =
    output.design ??
    output.chosen ??
    (output.images?.length === 1 ? output.images[0] : undefined)
  // Older chats designed two at once; show them all.
  const images = design ? [design] : (output.images ?? [])
  // Cancelling a review must not discard an image already made.
  const failed = images.length
    ? null
    : part.state === "failed" || part.state === "cancelled"
      ? (part.error?.message ?? "The story couldn’t be designed.")
      : output.status === "failed"
        ? (output.problem ?? "The story couldn’t be designed.")
        : null
  const designing =
    !failed &&
    images.length === 0 &&
    !["completed", "rejected"].includes(part.state)
  const progress = useProgress(output.started_at, designing)
  const [viewing, setViewing] = useState<{
    image: StoryImage
    editing: boolean
  } | null>(null)
  const [continuing, setContinuing] = useState(false)
  const [problem, setProblem] = useState("")
  const opener = useRef<HTMLButtonElement | null>(null)
  const reviewing =
    output.review === "waiting" &&
    part.interaction?.status === "open" &&
    !part.interaction.answer

  if (failed) {
    return (
      <section className={styles.story} aria-label="Story design">
        <p className={styles.error}>{failed}</p>
      </section>
    )
  }

  if (designing) {
    const percent = Math.round(progress * 100)
    return (
      <section className={styles.story} aria-label="Story design">
        <div
          className={styles.storyFrame}
          role="progressbar"
          aria-label={editing ? "Editing the story" : "Designing the story"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={styles.storyWake}>
            <AsciiWake
              width={FRAME_W}
              height={FRAME_H}
              size={9}
              shape="field"
              decorative
            />
          </div>
          <span className={styles.storyPercent} aria-hidden="true">
            {percent}%
          </span>
        </div>
        <p className={styles.hint}>
          {editing ? "Editing the story…" : "Designing the story…"}
        </p>
      </section>
    )
  }

  if (images.length === 0) return null

  return (
    <section className={styles.story} aria-label="Story design">
      <div className={styles.storyOptions}>
        {images.map((image, index) => {
          const name =
            images.length > 1 ? `Design ${index + 1}` : "The story design"
          return (
            <div key={image.path} className={styles.storyChoice}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a generated design in storage, of known size */}
              <img
                className={styles.storyImage}
                crossOrigin="anonymous"
                src={mediaUrl(image.path)}
                width={image.width}
                height={image.height}
                alt={name}
              />
              <div className={styles.storyControls}>
                <button
                  type="button"
                  className={styles.storyExpand}
                  aria-label={`Edit ${name.toLowerCase()}`}
                  title="Edit image"
                  disabled={actions.resuming || continuing}
                  onClick={(event) => {
                    opener.current = event.currentTarget
                    setViewing({ image, editing: true })
                  }}
                >
                  <Pencil size={14} strokeWidth={2} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.storyExpand}
                  aria-label={`View ${name.toLowerCase()} larger`}
                  title="View larger"
                  onClick={(event) => {
                    opener.current = event.currentTarget
                    setViewing({ image, editing: false })
                  }}
                >
                  <Maximize2 size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {reviewing && (
        <button
          type="button"
          className={styles.primary}
          disabled={actions.resuming || continuing}
          onClick={async () => {
            if (!part.interaction || continuing) return
            setContinuing(true)
            setProblem("")
            try {
              await actions.respond([
                {
                  interactionId: part.interaction.interactionId,
                  optionId: "continue",
                },
              ])
            } catch {
              setProblem("Couldn't continue. Try again.")
            } finally {
              setContinuing(false)
            }
          }}
        >
          {continuing ? "Continuing…" : "Continue"}
        </button>
      )}
      {problem && (
        <p className={styles.error} role="alert">
          {problem}
        </p>
      )}
      {viewing && (
        <StoryViewer
          image={viewing.image}
          initiallyEditing={viewing.editing}
          actions={actions}
          onClose={() => {
            setViewing(null)
            opener.current?.focus()
          }}
        />
      )}
    </section>
  )
})

/**
 * The design at full height, over the page, as it will post. A native modal
 * dialog, so focus stays inside it and Escape closes it.
 */
function StoryViewer({
  image,
  initiallyEditing,
  actions,
  onClose,
}: {
  image: StoryImage
  initiallyEditing: boolean
  actions: ChatActions
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState(initiallyEditing)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (!element.open) element.showModal()
    return () => element.close()
  }, [])

  return (
    <dialog
      ref={dialog}
      className={`${styles.storyViewer} ${editing ? styles.storyEditing : ""}`}
      aria-label="The story design, large view"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        // A press on the backdrop, outside the frame and controls.
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className={styles.storyViewerBar}>
        <span className={styles.storyViewerTitle}>Story design</span>
        <button
          type="button"
          className={styles.storyViewerButton}
          aria-pressed={editing}
          disabled={actions.resuming}
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "View image" : "Edit image"}
        </button>
        <button
          type="button"
          className={styles.storyViewerIcon}
          aria-label="Close"
          autoFocus
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      {editing ? (
        <StoryEditor image={image} actions={actions} onSent={onClose} />
      ) : (
        <div className={styles.storyViewerStage}>
          <figure className={styles.storyViewerFrame}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated design in storage, of known size */}
            <img
              crossOrigin="anonymous"
              src={mediaUrl(image.path)}
              width={image.width}
              height={image.height}
              alt="The story design"
            />
          </figure>
        </div>
      )}
    </dialog>
  )
}
