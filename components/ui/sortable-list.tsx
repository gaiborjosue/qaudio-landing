"use client"

/* Sortable List, from cult/ui (cult-ui.com/docs/components/sortable-list,
   github.com/nolly-studio/cult-ui), MIT. Like the original it is Motion's
   Reorder in a LayoutGroup: each row is a Reorder.Item started from a drag
   handle (useDragControls), numbered by its place, and settling on the same
   bounce-free 0.4s spring.

   Local changes, for reordering a listing rather than a task list:
   · generic rows (`items` with string ids, drawn by `renderItem`) instead of
     the fixed { text, checked, id, description } item
   · no checkbox, delete, or expand: every row stays, only its place
     changes. That drops the Checkbox and react-use-measure dependencies
   · monochrome, in the site's tokens, instead of the dark and red theme
   · drag starts only from the grip, so a touch elsewhere still scrolls
   · keyboard: the grip is a button, and the up and down arrow keys move its
     row; focus stays on it, and each move is announced
   · under reduced motion, rows move without the spring
   · an ordered list (<ol>) with an accessible name */

import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { GripVertical } from "lucide-react"
import {
  LayoutGroup,
  Reorder,
  useDragControls,
  useReducedMotion,
} from "motion/react"

import { cn } from "@/lib/utils"

const SPRING = { type: "spring" as const, bounce: 0, duration: 0.4 }
const STILL = { duration: 0 }

type SortableItem = { id: string }

function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  itemLabel,
  className,
  "aria-label": label,
}: {
  items: T[]
  onReorder: (items: T[]) => void
  /** A row's content, after its grip and number. */
  renderItem: (item: T, index: number) => ReactNode
  /** A row's name, for its grip's label and the move announcements. */
  itemLabel: (item: T) => string
  className?: string
  "aria-label"?: string
}) {
  const list = useRef<HTMLOListElement>(null)
  const refocus = useRef<string | null>(null)
  const [said, setSaid] = useState("")
  const hint = useId()

  // React may re-insert a moved row, which drops focus from its grip; put it
  // back once the new order is on screen.
  useLayoutEffect(() => {
    const id = refocus.current
    if (!id) return
    refocus.current = null
    list.current
      ?.querySelector<HTMLElement>(`[data-sortable-handle="${CSS.escape(id)}"]`)
      ?.focus()
  }, [items])

  const move = (index: number, step: -1 | 1) => {
    const to = index + step
    if (to < 0 || to >= items.length) return
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(to, 0, item)
    refocus.current = item.id
    setSaid(`${itemLabel(item)}, ${to + 1} of ${items.length}.`)
    onReorder(next)
  }

  return (
    <LayoutGroup>
      <Reorder.Group
        ref={list}
        as="ol"
        axis="y"
        values={items}
        onReorder={onReorder}
        aria-label={label}
        className={cn("m-0 flex list-none flex-col gap-1.5 p-0", className)}
      >
        {items.map((item, index) => (
          <SortableListItem
            key={item.id}
            item={item}
            order={index}
            label={itemLabel(item)}
            hint={hint}
            onMove={(step) => move(index, step)}
          >
            {renderItem(item, index)}
          </SortableListItem>
        ))}
      </Reorder.Group>
      <span id={hint} className="sr-only">
        Drag, or press the up and down arrow keys, to move.
      </span>
      <span className="sr-only" role="status">
        {said}
      </span>
    </LayoutGroup>
  )
}

function SortableListItem<T extends SortableItem>({
  item,
  order,
  label,
  hint,
  onMove,
  children,
}: {
  item: T
  order: number
  label: string
  hint: string
  onMove: (step: -1 | 1) => void
  children: ReactNode
}) {
  const controls = useDragControls()
  const [dragging, setDragging] = useState(false)
  const still = useReducedMotion()

  return (
    <Reorder.Item
      as="li"
      value={item}
      layout
      dragListener={false}
      dragControls={controls}
      onDragStart={() => setDragging(true)}
      onDragEnd={() => setDragging(false)}
      transition={still ? STILL : SPRING}
      whileDrag={{ zIndex: 10 }}
      data-dragging={dragging || undefined}
      className="relative flex min-w-0 items-center gap-2.5 rounded-xl border border-border bg-background py-1.5 pr-3 pl-1 data-dragging:shadow-lg"
    >
      <button
        type="button"
        data-sortable-handle={item.id}
        aria-label={`Move ${label}`}
        aria-describedby={hint}
        className="grid size-8 shrink-0 cursor-grab touch-none place-items-center rounded-lg border-0 bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground active:cursor-grabbing"
        onPointerDown={(event) => controls.start(event)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
          event.preventDefault()
          onMove(event.key === "ArrowUp" ? -1 : 1)
        }}
      >
        <GripVertical className="size-4" aria-hidden="true" />
      </button>
      <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {order + 1}
      </span>
      {children}
    </Reorder.Item>
  )
}

export { SortableList }
