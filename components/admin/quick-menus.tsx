"use client"

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react"
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "motion/react"
import {
  BadgePercent,
  CalendarClock,
  Camera,
  Clock,
  Ellipsis,
  Newspaper,
  Package,
  PackagePlus,
  PenLine,
} from "lucide-react"
import type { PreviewData } from "@/components/admin/change-preview"
import { FlowsMenu } from "@/components/admin/flows-menu"
import { ItemPicker, type PickerItem } from "@/components/admin/item-picker"
import type { ProductRequest } from "@/components/admin/products-view"
import { CreateMenu, type CreateMenuItem } from "@/components/ui/create-menu"
import type { FlowId, FlowSettings } from "@/lib/admin/flows"
import type { AdminDealItem, AdminNewsItem } from "@/lib/admin/preview"
import { newsStatus } from "@/lib/admin/news"
import { toStoreDateTime } from "@/lib/admin/store-time"
import { formatPrice } from "@/lib/catalog"
import { formatNewsDate } from "@/lib/news"
import { formatChangeDates, formatHours } from "@/lib/store-hours"
import styles from "./admin.module.css"

/** Sends a line as the owner's message; `item` names the exact item. */
export type Ask = (text: string, item?: string) => void

// The Create menu's rows and the line each one sends. Product is the
// exception: it opens the Products tab's form (see QuickMenus).
const QUICK_STARTS = [
  {
    icon: Newspaper,
    label: "News post",
    message: "I want to create a news post.",
  },
  { icon: PackagePlus, label: "Product", message: null },
  { icon: BadgePercent, label: "QDeal", message: "I want to create a deal." },
  {
    icon: CalendarClock,
    label: "Schedule change",
    message: "I want to add a schedule change.",
  },
  {
    icon: Camera,
    label: "Instagram post",
    message: "I want to create an Instagram post.",
  },
]

const day = (local: string) => formatNewsDate(local.slice(0, 10), "short")

function newsMeta(post: AdminNewsItem, now: string) {
  const status = newsStatus(post, now)
  if (status === "draft" || !post.publishedAt) return "Draft"
  return status === "scheduled"
    ? `Scheduled · ${day(post.publishedAt)}`
    : day(post.publishedAt)
}

function dealMeta(deal: AdminDealItem, now: string) {
  if (deal.status !== "published") return "Draft"
  if (deal.endsAt && deal.endsAt <= now) return "Ended"
  if (deal.startsAt && deal.startsAt > now)
    return `Starts ${day(deal.startsAt)}`
  return deal.endsAt ? `Until ${day(deal.endsAt)}` : "Live"
}

/** What the quick actions need from the chat, wherever they're shown. */
export type QuickMenusProps = {
  preview: PreviewData
  ask: Ask
  onProduct: (request: ProductRequest) => void
  flows: FlowSettings
  onFlow: (id: FlowId, on: boolean) => void
  disabled: boolean
}

/**
 * An element's left edge in the page as laid out, which transforms don't
 * move: the pills are measured while the row or the tray is still scaling
 * in, and getBoundingClientRect would measure them mid-animation.
 */
function layoutLeft(element: HTMLElement) {
  let left = 0
  for (let node: HTMLElement | null = element; node;) {
    const parent = node.offsetParent as HTMLElement | null
    left += node.offsetLeft + (parent?.clientLeft ?? 0)
    node = parent
  }
  return left
}

/**
 * The quick actions: Create, Edit, and Flows pills side by side, each
 * opening upward from its own corner. Every Create and Edit choice sends a
 * normal chat message, so the rest happens in the chat (questions,
 * previews, and approval), except products: those open in the Products
 * tab, without the chat. Flows switches the owner's preset sequences on
 * and off. Memoized: the chat redraws on every streamed update and
 * keystroke, and these don't change with them.
 */
export const QuickMenus = memo(function QuickMenus({
  preview,
  ask: send,
  onProduct: openProduct,
  flows,
  onFlow,
  disabled,
  bounds,
  onAction,
}: QuickMenusProps & {
  /** The edge the panels stay inside: the row itself unless given. */
  bounds?: RefObject<HTMLElement | null>
  /** Called when a Create or Edit choice runs (the tray closes then). */
  onAction?: () => void
}) {
  // Room from each pill's left edge to the right edge they stay inside, so
  // a panel never runs past the chat on a narrow screen. Measured again
  // when the row resizes or a pill does (labels are measured late, and the
  // Flows label changes), since that moves the ones after it.
  const row = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<number[]>([])
  useLayoutEffect(() => {
    const node = row.current
    if (!node) return
    const edge = bounds?.current ?? node
    const measure = () => {
      // A hidden copy measures zero; that isn't a width.
      if (edge.offsetWidth === 0) return
      const right = layoutLeft(edge) + edge.offsetWidth
      setRoom(
        [...node.children].map(
          (pill) => right - layoutLeft(pill as HTMLElement)
        )
      )
    }
    measure()
    const seen = new ResizeObserver(measure)
    seen.observe(node)
    if (edge !== node) seen.observe(edge)
    for (const pill of node.children) seen.observe(pill)
    return () => seen.disconnect()
  }, [bounds])
  const fit = (index: number, width: number) =>
    Math.min(width, room[index] ?? width)

  // Every choice that runs goes through these, so the tray can close.
  const ask: Ask = (text, item) => {
    onAction?.()
    send(text, item)
  }
  const onProduct = (request: ProductRequest) => {
    onAction?.()
    openProduct(request)
  }

  const create: CreateMenuItem[] = QUICK_STARTS.map(({ message, ...item }) => ({
    ...item,
    onSelect: () => (message ? ask(message) : onProduct({ mode: "new" })),
  }))

  // Edit and Remove both name the item, and its id rides along hidden.
  const pick = (
    kind: string,
    tag: string,
    id: string,
    title: string,
    meta: string,
    close: () => void
  ): PickerItem => {
    const item = `${tag} ${id}`
    return {
      id,
      title,
      meta,
      onEdit: () => {
        close()
        ask(`I want to edit the ${kind} “${title}”.`, item)
      },
      onRemove: () => {
        close()
        ask(`I want to remove the ${kind} “${title}”.`, item)
      },
    }
  }

  const edit: CreateMenuItem[] = [
    {
      icon: Package,
      label: "Product",
      view: {
        title: "Products",
        render: (close) => (
          <ItemPicker
            noun="product"
            items={preview.products.map((product) => ({
              id: product.id,
              title: product.name,
              meta: [
                product.category.name,
                formatPrice(product.price_cents),
                product.status !== "published" && "Draft",
              ]
                .filter(Boolean)
                .join(" · "),
              onEdit: () => {
                close()
                onProduct({ mode: "edit", id: product.id })
              },
              onRemove: () => {
                close()
                onProduct({ mode: "delete", id: product.id })
              },
            }))}
          />
        ),
      },
    },
    {
      icon: Newspaper,
      label: "News post",
      view: {
        title: "News posts",
        render: (close) => {
          const now = toStoreDateTime(new Date())
          return (
            <ItemPicker
              noun="news post"
              items={preview.news.map((post) =>
                pick(
                  "news post",
                  "news_post",
                  post.id,
                  post.title,
                  newsMeta(post, now),
                  close
                )
              )}
            />
          )
        },
      },
    },
    {
      icon: BadgePercent,
      label: "QDeal",
      view: {
        title: "QDeals",
        render: (close) => {
          const now = toStoreDateTime(new Date())
          return (
            <ItemPicker
              noun="QDeal"
              items={preview.deals.map((deal) =>
                pick(
                  "deal",
                  "deal",
                  deal.id,
                  deal.title,
                  dealMeta(deal, now),
                  close
                )
              )}
            />
          )
        },
      },
    },
    {
      icon: CalendarClock,
      label: "Schedule change",
      view: {
        title: "Schedule changes",
        render: (close) => (
          <ItemPicker
            noun="schedule change"
            items={preview.schedule.changes.map((change) =>
              pick(
                "schedule change",
                "hours_change",
                change.id,
                formatChangeDates(change),
                [formatHours(change.hours), change.note]
                  .filter(Boolean)
                  .join(" · "),
                close
              )
            )}
          />
        ),
      },
    },
    {
      icon: Clock,
      label: "Weekly hours",
      onSelect: () => ask("I want to change the regular weekly hours."),
    },
    {
      // Instagram posts live in Zernio, so the agent lists them.
      icon: Camera,
      label: "Instagram post",
      onSelect: () => ask("I want to change an Instagram post."),
    },
  ]

  return (
    <div ref={row} className={styles.quickMenus}>
      <CreateMenu
        items={create}
        side="top"
        disabled={disabled}
        panelWidth={fit(0, 212)}
      />
      {/* Wider: its lists need room for names and dates. */}
      <CreateMenu
        items={edit}
        label="Edit"
        icon={PenLine}
        side="top"
        disabled={disabled}
        panelWidth={fit(1, 320)}
      />
      <FlowsMenu
        settings={flows}
        onChange={onFlow}
        disabled={disabled}
        panelWidth={fit(2, 300)}
      />
    </div>
  )
})

// Where the composer's quick-actions button sits, from the quick-actions
// row: 95px from its left (the composer's 20px padding, the input row's
// 1px border and 6px padding, the 40px photo button, the 8px gap, and half
// the button) and 39px below its bottom (the composer's 12px top padding,
// the border and padding, and half the button). The pills shrink into it
// and grow back out of it.
const MORE_X = 95
const MORE_Y = 39
/** How much lower the button sits while photos wait above the field: their
 * 72px thumbnails and the composer's 10px gap. */
export const PHOTOS_LIFT = 82

const EASE = [0.22, 1, 0.36, 1] as const
const SPRING = { type: "spring" as const, stiffness: 460, damping: 34 }

// Folding, the pills speed up as they go into the button; coming back out
// they spring into place. `lift` is the button's extra drop while photos
// wait (AnimatePresence's custom, since the row has left by then).
const PILLS: Variants = {
  shown: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { ...SPRING, opacity: { duration: 0.16 } },
  },
  folded: (lift: number = 0) => ({
    opacity: 0,
    scale: 0.25,
    y: MORE_Y + lift,
    transition: {
      duration: 0.26,
      ease: [0.4, 0, 0.7, 0.2],
      opacity: { duration: 0.2, delay: 0.06 },
    },
  }),
}
// Under reduced motion they only fade.
const PILLS_STILL: Variants = {
  shown: { opacity: 1, transition: { duration: 0.16 } },
  folded: { opacity: 0, transition: { duration: 0.16 } },
}

/**
 * The quick actions above the message field, while it's empty. Once it
 * holds a message (words or photos) they're shortcuts the owner isn't
 * reaching for: the row closes and the pills shrink into the quick-actions
 * button beside the photo button (QuickActionsMore), and they grow back out
 * of it when the field is empty again. Outside the composer's form, so
 * Enter in a list's search can't send the message.
 */
export function QuickActionsRow({
  shown,
  lift,
  quick,
}: {
  shown: boolean
  /** PHOTOS_LIFT while photos wait above the field, otherwise 0. */
  lift: number
  quick: QuickMenusProps
}) {
  const still = useReducedMotion()
  return (
    <AnimatePresence initial={false} custom={lift}>
      {shown && (
        <motion.div
          key="quick-actions"
          className={styles.quickRow}
          initial={{ height: 0 }}
          animate={{ height: "auto" }}
          exit={{ height: 0 }}
          transition={still ? { duration: 0 } : { duration: 0.26, ease: EASE }}
        >
          {/* Stroke on: the white menus need their hairline on this light
              grey page. */}
          <motion.div
            className={styles.quickActions}
            role="group"
            aria-label="Quick actions"
            data-stroke="on"
            style={{ transformOrigin: `${MORE_X}px 100%` }}
            custom={lift}
            variants={still ? PILLS_STILL : PILLS}
            initial="folded"
            animate="shown"
            exit="folded"
          >
            <QuickMenus {...quick} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/**
 * The quick-actions button, beside the photo button while the field holds
 * a message: the Create, Edit, and Flows pills fold into it (see
 * QuickActionsRow), and it opens them in a tray that grows out of it, as
 * the photo popover does, where they work as they did above the field. A
 * Create or Edit choice closes the tray; Flows' switches leave it open.
 * Escape, a press outside, or focus moving on closes it too.
 */
export function QuickActionsMore({
  quick,
  bounds,
}: {
  quick: QuickMenusProps
  /** The composer's input row: the tray's panels stay inside its width. */
  bounds: RefObject<HTMLElement | null>
}) {
  const still = useReducedMotion()
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const tray = useRef<HTMLDivElement>(null)
  const trayId = useId()

  const close = useCallback((refocus: boolean) => {
    setOpen(false)
    if (refocus) button.current?.focus()
  }, [])
  // A choice ran: the tray goes, and focus comes back to its button.
  const done = useCallback(() => close(true), [close])

  // Open, focus goes to the first pill, and a press anywhere but the
  // button and the tray (the pills' panels are inside it) closes it.
  useEffect(() => {
    if (!open) return
    tray.current
      ?.querySelector<HTMLElement>(".crt-pill:not(:disabled)")
      ?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // An open pill's panel takes Escape first (and keeps it).
    if (event.key === "Escape" && open) {
      event.stopPropagation()
      close(true)
    }
    // The tray sits inside the composer's form, where Enter in an Edit
    // list's search would send the message. It does nothing there.
    if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
      event.preventDefault()
    }
  }

  return (
    <motion.div
      ref={anchor}
      className={styles.moreAnchor}
      // It opens its own room beside the photo button, so the field slides
      // over rather than jumping.
      initial={{ width: 0, marginLeft: -8 }}
      animate={{ width: 40, marginLeft: 0 }}
      exit={{ width: 0, marginLeft: -8 }}
      transition={still ? { duration: 0 } : { duration: 0.26, ease: EASE }}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && !event.currentTarget.contains(next)) {
          setOpen(false)
        }
      }}
    >
      <motion.button
        ref={button}
        type="button"
        className={styles.iconButton}
        aria-label="Quick actions"
        title="Quick actions"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? trayId : undefined}
        disabled={quick.disabled}
        onClick={() => (open ? close(true) : setOpen(true))}
        // It takes the pills in as they arrive, and lets them go first.
        initial={{ opacity: 0, scale: 0.4 }}
        animate={{
          opacity: 1,
          scale: 1,
          transition: {
            ...SPRING,
            delay: still ? 0 : 0.1,
            opacity: { duration: 0.16, delay: still ? 0 : 0.1 },
          },
        }}
        exit={{ opacity: 0, scale: 0.4, transition: { duration: 0.14 } }}
      >
        <Ellipsis size={20} strokeWidth={1.6} aria-hidden="true" />
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={tray}
            id={trayId}
            className={styles.quickTray}
            role="dialog"
            aria-label="Quick actions"
            data-stroke="on"
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 6 }}
            transition={{ type: "spring", stiffness: 520, damping: 36 }}
          >
            <QuickMenus {...quick} bounds={bounds} onAction={done} />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
