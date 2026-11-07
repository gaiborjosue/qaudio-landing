"use client"

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react"
import { Popover } from "@base-ui/react/popover"
import { Eraser, Info, Move, Plus, Replace, Trash2, X } from "lucide-react"
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
import { type StoryImage } from "@/lib/admin/story-images"
import styles from "./story-editor.module.css"

type Region = StoryRegion & { key: string }
type Operation = Region["operation"]
type Drag = { pointer: number; start: readonly number[]; box: StoryBox }

// What each area can do; its label and the field under it say how.
const ACTIONS: {
  value: Operation
  label: string
  Icon: typeof Replace
  field: string
  placeholder: string
  required: boolean
}[] = [
  {
    value: "change",
    label: "Change",
    Icon: Replace,
    field: "Change it to",
    placeholder: "Exact text, look…",
    required: true,
  },
  {
    value: "add",
    label: "Add",
    Icon: Plus,
    field: "Add",
    placeholder: "Exact text, look…",
    required: true,
  },
  {
    value: "remove",
    label: "Remove",
    Icon: Eraser,
    field: "Details (optional)",
    placeholder: "e.g. the price tag",
    required: false,
  },
  {
    value: "move",
    label: "Move",
    Icon: Move,
    field: "Details (optional)",
    placeholder: "e.g. a bit larger",
    required: false,
  },
]

// An area added from the keyboard: the middle of the frame.
const MIDDLE: StoryBox = [350, 250, 650, 750]

/**
 * Edits a story design by areas the owner drags out on the image (or adds
 * with Enter from the keyboard), each with an action, plus overall
 * feedback. Areas are measured against the displayed image, including on
 * phones; the edit goes back to the agent as a `Story edit:` line.
 */
export function StoryEditor({
  image,
  actions,
  onSent,
}: {
  image: StoryImage
  actions: ChatActions
  onSent: () => void
}) {
  const id = useId()
  const [regions, setRegions] = useState<Region[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  // Drawing where the selected area moves to.
  const [placing, setPlacing] = useState(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [instructions, setInstructions] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lock = useRef(false)
  const root = useRef<HTMLDivElement>(null)
  const slot = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()
  const active = selected === null ? null : regions[selected]
  const action = ACTIONS.find((item) => item.value === active?.operation)
  const busy = sending || actions.resuming
  const full = regions.length >= STORY_REGIONS_MAX
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
  const add = (box: StoryBox) => {
    if (full) return
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
    setPlacing(false)
  }
  const remove = (index: number) => {
    setRegions((rows) => rows.filter((_, i) => i !== index))
    setSelected((current) =>
      current === null || current === index
        ? null
        : current > index
          ? current - 1
          : current
    )
    if (selected === index) setPlacing(false)
  }
  const choose = (operation: Operation) => {
    update({ operation })
    // Move needs a destination: go straight to drawing it.
    setPlacing(operation === "move" && !active?.target)
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
    if (placing && active) {
      update({ target: box })
      setPlacing(false)
    } else add(box)
  }
  // Arrow keys move a box, Shift + arrows resize it.
  const nudge = (event: KeyboardEvent, box: StoryBox) => {
    if (!event.key.startsWith("Arrow")) return null
    event.preventDefault()
    return adjustStoryBox(box, event.key, event.shiftKey)
  }

  return (
    <div
      ref={root}
      className={styles.editor}
      onKeyDown={(event) => {
        // Escape leaves drawing a destination before it closes the viewer.
        if (event.key === "Escape" && placing) {
          event.preventDefault()
          event.stopPropagation()
          setPlacing(false)
        }
      }}
    >
      <div className={styles.canvasSlot} ref={slot}>
        <div className={styles.canvas} style={{ width }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- the stored story, at its exact frame */}
          <img
            crossOrigin="anonymous"
            src={mediaUrl(image.path)}
            alt="Story image to edit"
            width={image.width}
            height={image.height}
            draggable={false}
          />
          <div
            className={styles.layer}
            data-placing={placing || undefined}
            data-full={(!placing && full) || undefined}
            role="group"
            tabIndex={busy ? -1 : 0}
            aria-label="Story image"
            aria-describedby={`${id}-hint`}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget || busy) return
              if (event.key !== "Enter" && event.key !== " ") return
              event.preventDefault()
              if (placing && active) {
                update({ target: [...active.box] })
                setPlacing(false)
              } else add(MIDDLE)
            }}
            onPointerDown={(event) => {
              if (
                busy ||
                !event.isPrimary ||
                event.button !== 0 ||
                (!placing && full)
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
              <div
                key={row.key}
                className={styles.region}
                style={storyBoxStyle(row.box)}
                data-selected={selected === index || undefined}
              >
                <button
                  type="button"
                  className={styles.regionSelect}
                  aria-label={`Area ${index + 1}, ${ACTIONS.find((item) => item.value === row.operation)!.label.toLowerCase()}`}
                  aria-pressed={selected === index}
                  disabled={busy}
                  onPointerDown={(event) => event.stopPropagation()}
                  onFocus={() => {
                    if (!placing) setSelected(index)
                  }}
                  onClick={() => {
                    if (!placing) setSelected(index)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Delete" || event.key === "Backspace") {
                      event.preventDefault()
                      remove(index)
                      return
                    }
                    const box = nudge(event, row.box)
                    if (box)
                      setRegions((rows) =>
                        rows.map((item, i) =>
                          i === index ? { ...item, box } : item
                        )
                      )
                  }}
                >
                  <span className={styles.number}>{index + 1}</span>
                </button>
                <button
                  type="button"
                  className={styles.regionDelete}
                  aria-label={`Delete area ${index + 1}`}
                  title="Delete area"
                  disabled={busy}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => remove(index)}
                >
                  <X size={12} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            ))}
            {regions.map(
              (row, index) =>
                row.operation === "move" &&
                row.target && (
                  <button
                    key={`${row.key}-target`}
                    type="button"
                    className={styles.target}
                    style={storyBoxStyle(row.target)}
                    data-selected={selected === index || undefined}
                    aria-label={`Where area ${index + 1} moves; arrow keys move it, Shift and arrow keys resize it`}
                    disabled={busy}
                    onPointerDown={(event) => event.stopPropagation()}
                    onFocus={() => {
                      if (!placing) setSelected(index)
                    }}
                    onKeyDown={(event) => {
                      const box = nudge(event, row.target!)
                      if (box)
                        setRegions((rows) =>
                          rows.map((item, i) =>
                            i === index ? { ...item, target: box } : item
                          )
                        )
                    }}
                  >
                    <span className={styles.number}>{index + 1}</span>
                  </button>
                )
            )}
            {drag && (
              <span
                className={styles.drawing}
                style={storyBoxStyle(drag.box)}
                aria-hidden="true"
              />
            )}
          </div>
          {placing && active ? (
            <div className={styles.banner} role="status">
              Draw where area {selected! + 1} goes
              <button type="button" onClick={() => setPlacing(false)}>
                Cancel
              </button>
            </div>
          ) : (
            regions.length === 0 &&
            !drag && (
              <p className={styles.cue} aria-hidden="true">
                Drag to mark an area
              </p>
            )
          )}
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
          {/* The first legend stays usable while the fieldset is disabled. */}
          <legend className={styles.title}>
            Edit image
            <Popover.Root>
              <Popover.Trigger
                openOnHover
                delay={150}
                className={styles.info}
                aria-label="How editing works"
              >
                <Info size={15} aria-hidden="true" />
              </Popover.Trigger>
              <Popover.Portal container={root} className={styles.infoPortal}>
                <Popover.Positioner
                  side="bottom"
                  align="start"
                  sideOffset={8}
                  collisionPadding={12}
                  className={styles.infoPositioner}
                >
                  <Popover.Popup className={styles.infoPopup}>
                    <ul>
                      <li>
                        Drag on the image to mark an area, then pick what to do
                        there.
                      </li>
                      <li>
                        Up to {STORY_REGIONS_MAX} areas. Hover one to delete it.
                      </li>
                      <li>
                        Keyboard: Enter on the image adds an area; arrows move
                        it, Shift + arrows resize, Delete removes.
                      </li>
                      <li>
                        Areas guide the edit; nearby details can change too.
                      </li>
                    </ul>
                  </Popover.Popup>
                </Popover.Positioner>
              </Popover.Portal>
            </Popover.Root>
          </legend>
          <p id={`${id}-hint`} className="visually-hidden">
            Drag to mark an area, or press Enter to add one. Arrows move it,
            Shift + arrows resize.
          </p>
          {full && (
            <p className={styles.hint}>Up to {STORY_REGIONS_MAX} areas.</p>
          )}
          {active && action && (
            <section
              className={styles.area}
              aria-label={`Area ${selected! + 1}`}
            >
              <p className={styles.areaTitle}>
                <span className={styles.number}>{selected! + 1}</span>
                Area {selected! + 1}
              </p>
              <fieldset className={styles.actions}>
                <legend className="visually-hidden">
                  What to do in area {selected! + 1}
                </legend>
                {ACTIONS.map(({ value, label, Icon }) => (
                  <label key={value} className={styles.action}>
                    <input
                      type="radio"
                      name={`${id}-action`}
                      value={value}
                      checked={active.operation === value}
                      onChange={() => choose(value)}
                    />
                    <Icon size={15} aria-hidden="true" />
                    {label}
                  </label>
                ))}
              </fieldset>
              {active.operation === "move" && (
                <div className={styles.destination}>
                  <span>
                    {placing
                      ? "Drawing destination…"
                      : active.target
                        ? "Destination set"
                        : "Needs a destination"}
                  </span>
                  {!placing && (
                    <button type="button" onClick={() => setPlacing(true)}>
                      {active.target ? "Redraw" : "Draw"}
                    </button>
                  )}
                </div>
              )}
              <label className={styles.field}>
                {action.field}
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={active.instruction}
                  placeholder={action.placeholder}
                  required={action.required}
                  onChange={(event) =>
                    update({ instruction: event.target.value })
                  }
                />
              </label>
              <button
                type="button"
                className={styles.remove}
                onClick={() => remove(selected!)}
              >
                <Trash2 size={14} aria-hidden="true" /> Delete area
              </button>
            </section>
          )}
          {regions.length > 0 && !active && (
            <p className={styles.hint}>Select an area to edit.</p>
          )}
          <label className={styles.field}>
            Overall changes
            <textarea
              rows={3}
              maxLength={2000}
              value={instructions}
              placeholder="Anything else? Works without areas too."
              onChange={(event) => setInstructions(event.target.value)}
            />
          </label>
          {(regions.length > 0 || instructions.trim()) && !parsed.success && (
            <p className={styles.hint} role="status">
              {parsed.error.issues[0]?.message}
            </p>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
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
