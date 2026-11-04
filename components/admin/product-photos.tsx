"use client"

import { useId, useLayoutEffect, useRef, useState } from "react"
import Image from "next/image"
import {
  motion,
  Reorder,
  useDragControls,
  useReducedMotion,
} from "motion/react"
import { Check, ChevronLeft, ChevronRight, GripVertical, X } from "lucide-react"
import type { EditorPhoto } from "@/lib/admin/product-editor"
import { mediaUrl } from "@/lib/media"
import styles from "./product-editor.module.css"

/**
 * One scrolling row, with thumbnail drags and keyboard controls sharing
 * order. Photos Prefill with Tune suggested (`suggested` paths) wear a
 * dashed edge and an Accept button until the owner accepts or removes them.
 */
export function ProductPhotos({
  images,
  onChange,
  onRemove,
  suggested = [],
  onAccept,
}: {
  images: EditorPhoto[]
  onChange: (images: EditorPhoto[]) => void
  onRemove: (index: number) => void
  suggested?: readonly string[]
  onAccept?: (path: string) => void
}) {
  const hint = useId()
  const refocus = useRef<HTMLButtonElement | null>(null)
  const [announcement, setAnnouncement] = useState("")
  const photosByPath = new Map(images.map((photo) => [photo.path, photo]))

  // Moving a card can briefly detach the focused button. Restore it and
  // reveal the new position without scrolling the whole sheet to the top.
  useLayoutEffect(() => {
    const button = refocus.current
    refocus.current = null
    if (!button?.isConnected || button.offsetWidth === 0) return
    const target = button.disabled
      ? button
          .closest("li")
          ?.querySelector<HTMLButtonElement>("[data-photo-drag]")
      : button
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    })
  }, [images])

  const move = (index: number, step: -1 | 1, button: HTMLButtonElement) => {
    const to = index + step
    if (to < 0 || to >= images.length) return
    const next = [...images]
    ;[next[index], next[to]] = [next[to], next[index]]
    refocus.current = button
    setAnnouncement(
      `Photo ${index + 1} moved to ${to + 1} of ${images.length}.`
    )
    onChange(next)
  }

  return (
    <>
      {/* Motion's edge scrolling looks for a scrollable parent of the group. */}
      <motion.div layoutScroll className={styles.photoScroller}>
        <Reorder.Group
          as="ol"
          axis="x"
          values={images.map((photo) => photo.path)}
          onReorder={(paths) =>
            onChange(paths.map((path) => photosByPath.get(path)!))
          }
          aria-label="Product photos"
          className={styles.photoList}
        >
          {images.map((photo, index) => (
            <ProductPhoto
              key={photo.path}
              photo={photo}
              index={index}
              count={images.length}
              hint={hint}
              onDescription={(alt) =>
                onChange(
                  images.map((item) =>
                    item.path === photo.path ? { ...item, alt } : item
                  )
                )
              }
              onMove={(step, button) => move(index, step, button)}
              onRemove={() => onRemove(index)}
              suggested={suggested.includes(photo.path)}
              onAccept={() => onAccept?.(photo.path)}
              onDrop={() =>
                setAnnouncement(`Photo at ${index + 1} of ${images.length}.`)
              }
            />
          ))}
        </Reorder.Group>
      </motion.div>
      <span id={hint} className="sr-only">
        Drag to reorder, or use the left and right arrow keys.
      </span>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </>
  )
}

function ProductPhoto({
  photo,
  index,
  count,
  hint,
  onDescription,
  onMove,
  onRemove,
  onDrop,
  suggested,
  onAccept,
}: {
  photo: EditorPhoto
  index: number
  count: number
  hint: string
  onDescription: (alt: string) => void
  onMove: (step: -1 | 1, button: HTMLButtonElement) => void
  onRemove: () => void
  onDrop: () => void
  suggested: boolean
  onAccept: () => void
}) {
  const controls = useDragControls()
  const still = useReducedMotion()
  const [dragging, setDragging] = useState(false)

  return (
    <Reorder.Item
      as="li"
      value={photo.path}
      tabIndex={-1}
      layout="position"
      dragListener={false}
      dragControls={controls}
      dragMomentum={false}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => {
        setDragging(false)
        onDrop()
      }}
      data-dragging={dragging || undefined}
      data-suggested={suggested || undefined}
      transition={{
        layout: { duration: still ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] },
      }}
    >
      <button
        type="button"
        className={styles.photoDrag}
        data-photo-drag
        aria-label={`Move photo ${index + 1}`}
        aria-describedby={hint}
        onPointerDown={(event) => {
          if (event.button === 0) controls.start(event)
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
          event.preventDefault()
          onMove(event.key === "ArrowLeft" ? -1 : 1, event.currentTarget)
        }}
      >
        <Image
          src={mediaUrl(photo.path)}
          alt=""
          width={132}
          height={132}
          sizes="132px"
          draggable={false}
        />
        <span className={styles.photoGrip} aria-hidden="true">
          <GripVertical size={14} />
        </span>
      </button>
      <input
        type="text"
        value={photo.alt}
        placeholder="Describe this photo"
        aria-label={`Description of photo ${index + 1}`}
        onChange={(event) => onDescription(event.target.value)}
      />
      <div className={styles.photoActions}>
        <button
          type="button"
          aria-label={`Move photo ${index + 1} earlier`}
          disabled={index === 0}
          onClick={(event) => onMove(-1, event.currentTarget)}
        >
          <ChevronLeft size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label={`Move photo ${index + 1} later`}
          disabled={index === count - 1}
          onClick={(event) => onMove(1, event.currentTarget)}
        >
          <ChevronRight size={14} aria-hidden="true" />
        </button>
        {suggested && (
          <button
            type="button"
            aria-label={`Accept Tune’s photo ${index + 1}`}
            title="Accept"
            onClick={(event) => {
              // The button goes away; keep focus on this photo.
              event.currentTarget
                .closest("li")
                ?.querySelector<HTMLElement>("[data-photo-drag]")
                ?.focus()
              onAccept()
            }}
          >
            <Check size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          aria-label={
            suggested
              ? `Reject Tune’s photo ${index + 1}`
              : `Remove photo ${index + 1}`
          }
          title={suggested ? "Reject" : undefined}
          onClick={onRemove}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
    </Reorder.Item>
  )
}
