"use client"

import { memo, useEffect, useRef, useState } from "react"
import { Maximize2, Pencil, X } from "lucide-react"
import type { EveToolPart } from "eve/react"
import { AsciiWake } from "@/components/ascii-wake"
import type { ChatActions } from "./chat-actions"
import { StoryEditor } from "./story-editor"
import { storyEditMessage } from "@/lib/admin/story-edits"
import { storyProgress, type StoryImage } from "@/lib/admin/story-images"
import {
  madeStory,
  storyVersionText,
  type StoryVersions,
} from "@/lib/admin/story-versions"
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
 * will be posted), with buttons at its top right to edit it or see it
 * large. Each new version of a story replaces the one before in the chat:
 * the newest card carries the version number and a strip to view every
 * version, and while it waits for Continue the owner can pick an earlier
 * version to go on with (lib/admin/story-versions.ts).
 */
export const StoryDesigns = memo(function StoryDesigns({
  part,
  actions,
  versions,
}: {
  part: EveToolPart
  actions: ChatActions
  /** This design's place among its story's versions in the chat. */
  versions?: StoryVersions
}) {
  const editing = part.name === "edit_story"
  const output = (part.output ?? {}) as Output
  const design = madeStory(output)
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
  // An earlier version the owner picked to go on with, by number.
  const [picked, setPicked] = useState<number | null>(null)
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
  // A newer version of this story replaces it in the chat; the newest
  // card's version strip still shows it.
  if (versions && !versions.latest && !reviewing) return null

  const all = versions?.versions ?? []
  const own = versions?.version
  const several = all.length > 1 && images.length === 1
  // A review that went on with an earlier version says which, and shows it.
  const continuedWith =
    output.review === "continued" &&
    design &&
    output.design &&
    output.design.path !== design.path
      ? all.findIndex((image) => image.path === output.design!.path) + 1
      : 0
  const shownVersion = picked ?? (continuedWith || own)
  const shown =
    several && shownVersion && shownVersion !== own
      ? [all[shownVersion - 1]]
      : images
  // While it waits for Continue, an earlier version may stand in for it.
  const chosen =
    reviewing && shownVersion && shownVersion !== own ? shownVersion : null

  const answer = async () => {
    if (!part.interaction || continuing) return
    setContinuing(true)
    setProblem("")
    try {
      await actions.respond([
        {
          interactionId: part.interaction.interactionId,
          optionId: "continue",
          ...(chosen && {
            text: storyVersionText(chosen, all[chosen - 1]),
          }),
        },
      ])
    } catch {
      setProblem("Couldn't continue. Try again.")
    } finally {
      setContinuing(false)
    }
  }

  return (
    <section className={styles.story} aria-label="Story design">
      <div className={styles.storyOptions}>
        {shown.map((image, index) => {
          const name =
            images.length > 1
              ? `Design ${index + 1}`
              : several
                ? `Version ${shownVersion} of the story design`
                : "The story design"
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
              {several && (
                <span className={styles.storyVersion} aria-hidden="true">
                  V{shownVersion}
                </span>
              )}
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
      {several && (
        <div
          className={styles.storyVersions}
          role="group"
          aria-label={reviewing ? "Versions to continue with" : "Versions"}
        >
          {all.map((image, index) => {
            const number = index + 1
            return (
              <button
                key={image.path}
                type="button"
                className={styles.storyVersionOption}
                aria-label={`Version ${number}${number === own ? ", newest" : ""}`}
                aria-pressed={number === shownVersion}
                disabled={continuing}
                onClick={() => setPicked(number)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a generated design in storage, of known size */}
                <img
                  crossOrigin="anonymous"
                  src={mediaUrl(image.path)}
                  width={image.width}
                  height={image.height}
                  alt=""
                />
                <span aria-hidden="true">V{number}</span>
              </button>
            )
          })}
        </div>
      )}
      {continuedWith > 0 && (
        <p className={styles.hint}>Continued with V{continuedWith}</p>
      )}
      {reviewing && (
        <button
          type="button"
          className={styles.primary}
          disabled={actions.resuming || continuing}
          onClick={() => void answer()}
        >
          {continuing
            ? "Continuing…"
            : chosen
              ? `Continue with V${chosen}`
              : "Continue"}
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
          version={several ? shownVersion : undefined}
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
  version,
  initiallyEditing,
  actions,
  onClose,
}: {
  image: StoryImage
  version?: number
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
        <span className={styles.storyViewerTitle}>
          Story design
          {version && (
            <span className={styles.storyViewerVersion}>V{version}</span>
          )}
        </span>
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
        <StoryEditor
          image={image}
          disabled={actions.resuming}
          onApply={async (input) => {
            await actions.send(storyEditMessage(input))
            onClose()
          }}
        />
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
