"use client"

import { useEffect, useId, useRef, useState, type PointerEvent } from "react"
import { Plus, Trash2 } from "lucide-react"
import type { ChatActions } from "./chat-actions"
import { mediaUrl } from "@/lib/media"
import {
  STORY_REGIONS_MAX,
  adjustStoryBox,
  storyBoxFromPoints,
  storyBoxStyle,
  storyEditInput,
  storyEditMessage,
  storyPoint,
  type StoryBox,
  type StoryRegion,
} from "@/lib/admin/story-edits"
import { STORY_FRAME, type StoryImage } from "@/lib/admin/story-images"
import styles from "./story-editor.module.css"

type Region = StoryRegion & { key: string }
type Drag = { pointer: number; start: readonly number[]; box: StoryBox }

/** Regions are measured against the actual displayed image, including on phones. */
export function StoryEditor({
  image,
  actions,
  onSent,
  zones,
}: {
  image: StoryImage
  actions: ChatActions
  onSent: () => void
  zones: boolean
}) {
  const id = useId()
  const [regions, setRegions] = useState<Region[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [destination, setDestination] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [instructions, setInstructions] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const slot = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
  const active = selected === null ? null : regions[selected]
  const busy = sending || actions.resuming
  const parsed = storyEditInput.safeParse({
    image: image.path,
    instructions,
    regions,
  })

  useEffect(() => {
    const element = slot.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setWidth(Math.min(width, (height * 9) / 16))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const update = (change: Partial<Region>) => {
    if (selected === null) return
    setRegions((rows) =>
      rows.map((row, index) =>
        index === selected ? { ...row, ...change } : row
      )
    )
  }
  const add = (box: StoryBox = [250, 200, 600, 800]) => {
    if (regions.length >= STORY_REGIONS_MAX) return
    setRegions((rows) => [
      ...rows,
      {
        key: crypto.randomUUID(),
        operation: "change",
        box,
        target: null,
        instruction: "",
      },
    ])
    setSelected(regions.length)
    setDestination(false)
  }
  const point = (event: PointerEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return storyPoint(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height
    )
  }
  const finish = (event: PointerEvent<HTMLElement>) => {
    if (!drag || drag.pointer !== event.pointerId) return
    const end = point(event)
    setDrag(null)
    if (!end) return
    const box = storyBoxFromPoints(drag.start, end)
    // Very small boxes do not reliably produce edits; ignore accidental taps.
    if (box[2] - box[0] < 15 || box[3] - box[1] < 15) return
    if (destination && active) {
      update({ target: box })
      setDestination(false)
    } else add(box)
  }

  return (
    <div className={styles.editor}>
      <div className={styles.canvasSlot} ref={slot}>
        <div className={styles.canvas} style={{ width }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the stored story, at its exact frame */}
          <img
            src={mediaUrl(image.path)}
            alt="Story image to edit"
            width={image.width}
            height={image.height}
            draggable={false}
          />
          {zones && (
            <div className={styles.safeZone} aria-hidden="true">
              <span
                style={{
                  height: `${(STORY_FRAME.top / STORY_FRAME.height) * 100}%`,
                }}
              />
              <span
                style={{
                  height: `${(STORY_FRAME.bottom / STORY_FRAME.height) * 100}%`,
                }}
              />
            </div>
          )}
          <div
            className={styles.layer}
            role="group"
            aria-label="Story regions"
            aria-describedby={`${id}-hint`}
            onPointerDown={(event) => {
              if (
                busy ||
                !event.isPrimary ||
                event.button !== 0 ||
                (!destination && regions.length >= STORY_REGIONS_MAX)
              )
                return
              const start = point(event)
              if (!start) return
              event.currentTarget.setPointerCapture(event.pointerId)
              setDrag({
                pointer: event.pointerId,
                start,
                box: storyBoxFromPoints(start, start),
              })
            }}
            onPointerMove={(event) => {
              if (!drag || drag.pointer !== event.pointerId) return
              const end = point(event)
              if (end)
                setDrag({ ...drag, box: storyBoxFromPoints(drag.start, end) })
            }}
            onPointerUp={finish}
            onPointerCancel={() => setDrag(null)}
            onLostPointerCapture={() => setDrag(null)}
          >
            {regions.map((row, index) => (
              <button
                key={row.key}
                type="button"
                className={styles.region}
                style={storyBoxStyle(row.box)}
                aria-label={`Select region ${index + 1}`}
                aria-pressed={selected === index}
                disabled={busy}
                onFocus={() => {
                  if (!destination) setSelected(index)
                }}
                onKeyDown={(event) => {
                  if (!event.key.startsWith("Arrow")) return
                  event.preventDefault()
                  setRegions((rows) =>
                    rows.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            box: adjustStoryBox(
                              row.box,
                              event.key,
                              event.shiftKey
                            ),
                          }
                        : row
                    )
                  )
                }}
                onPointerDown={(event) => {
                  if (!destination) event.stopPropagation()
                }}
                onClick={() => {
                  if (!destination) setSelected(index)
                }}
              >
                <span>{index + 1}</span>
              </button>
            ))}
            {active?.operation === "move" && active.target && (
              <button
                type="button"
                className={styles.target}
                style={storyBoxStyle(active.target)}
                aria-label="Move destination; use arrow keys to move, Shift and arrow keys to resize"
                disabled={busy}
                onPointerDown={(event) => {
                  if (!destination) event.stopPropagation()
                }}
                onKeyDown={(event) => {
                  if (!event.key.startsWith("Arrow") || !active.target) return
                  event.preventDefault()
                  update({
                    target: adjustStoryBox(
                      active.target,
                      event.key,
                      event.shiftKey
                    ),
                  })
                }}
              >
                Destination
              </button>
            )}
            {drag && (
              <span
                className={styles.drawing}
                style={storyBoxStyle(drag.box)}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      </div>
      <form
        className={styles.panel}
        onSubmit={async (event) => {
          event.preventDefault()
          if (!parsed.success || busy || lock.current) return
          lock.current = true
          setSending(true)
          setError(null)
          try {
            await actions.send(storyEditMessage(parsed.data))
            onSent()
          } catch {
            setError("Couldn’t send these edits. Try again.")
          } finally {
            lock.current = false
            setSending(false)
          }
        }}
      >
        <fieldset disabled={busy}>
          <legend className={styles.title}>Edit image</legend>
          <p id={`${id}-hint`} className={styles.hint}>
            {destination
              ? "Draw where this region should move."
              : "Draw a region, or add one and use its arrow keys to move it. Shift + arrows resizes it."}
          </p>
          <div
            className={styles.regions}
            role="group"
            aria-label="Selected regions"
          >
            {regions.map((row, index) => (
              <button
                type="button"
                key={row.key}
                aria-pressed={selected === index}
                onClick={() => {
                  setSelected(index)
                  setDestination(false)
                }}
              >
                Region {index + 1}
              </button>
            ))}
            <button
              type="button"
              onClick={() => add()}
              disabled={regions.length >= STORY_REGIONS_MAX}
            >
              <Plus size={14} aria-hidden="true" /> Add region
            </button>
          </div>
          {active && (
            <div className={styles.regionFields}>
              <label>
                Action
                <select
                  value={active.operation}
                  onChange={(event) => {
                    update({
                      operation: event.target.value as Region["operation"],
                    })
                    setDestination(false)
                  }}
                >
                  <option value="change">Change</option>
                  <option value="add">Add</option>
                  <option value="remove">Remove</option>
                  <option value="move">Move / resize</option>
                </select>
              </label>
              <label>
                What should change in region {selected! + 1}?
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={active.instruction}
                  placeholder={
                    active.operation === "remove"
                      ? "Remove the content in this region"
                      : "Describe the result, including exact text"
                  }
                  onChange={(event) =>
                    update({ instruction: event.target.value })
                  }
                />
              </label>
              {active.operation === "move" && (
                <button
                  type="button"
                  aria-pressed={destination}
                  onClick={() => {
                    if (!active.target) update({ target: [...active.box] })
                    setDestination((value) => !value)
                  }}
                >
                  Select destination
                </button>
              )}
              <button
                type="button"
                className={styles.remove}
                onClick={() => {
                  setRegions((rows) =>
                    rows.filter((_, index) => index !== selected)
                  )
                  setSelected(null)
                  setDestination(false)
                }}
              >
                <Trash2 size={14} aria-hidden="true" /> Remove selection
              </button>
            </div>
          )}
          <label>
            Overall feedback
            <textarea
              rows={3}
              maxLength={2000}
              value={instructions}
              placeholder="Anything else to change? You can also edit the whole image without selecting regions."
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          {regions.length > 0 && !parsed.success && (
            <p className={styles.hint} role="status">
              {parsed.error.issues[0]?.message}
            </p>
          )}
          {error && <p role="alert">{error}</p>}
          <button
            type="submit"
            className={styles.submit}
            disabled={!parsed.success || busy}
          >
            {sending ? "Sending…" : "Apply edits"}
          </button>
        </fieldset>
      </form>
    </div>
  )
}
