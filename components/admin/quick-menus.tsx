"use client"

import { useLayoutEffect, useRef, useState } from "react"
import {
  BadgePercent,
  CalendarClock,
  Camera,
  Clock,
  Newspaper,
  Package,
  PackagePlus,
  PenLine,
} from "lucide-react"
import type { PreviewData } from "@/components/admin/change-preview"
import { ItemPicker, type PickerItem } from "@/components/admin/item-picker"
import type { ProductRequest } from "@/components/admin/products-view"
import { CreateMenu, type CreateMenuItem } from "@/components/ui/create-menu"
import type { AdminDealItem, AdminNewsItem } from "@/lib/admin/preview"
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
  if (post.status !== "published" || !post.publishedAt) return "Draft"
  if (post.publishedAt > now) return `Scheduled · ${day(post.publishedAt)}`
  return day(post.publishedAt)
}

function dealMeta(deal: AdminDealItem, now: string) {
  if (deal.status !== "published") return "Draft"
  if (deal.endsAt && deal.endsAt <= now) return "Ended"
  if (deal.startsAt && deal.startsAt > now)
    return `Starts ${day(deal.startsAt)}`
  return deal.endsAt ? `Until ${day(deal.endsAt)}` : "Live"
}

/**
 * The quick actions: Create and Edit pills side by side, each opening
 * upward from its own corner. Every choice sends a normal chat message, so
 * the rest happens in the chat (questions, previews, and approval), except
 * products: those open in the Products tab, without the chat.
 */
export function QuickMenus({
  preview,
  ask,
  onProduct,
  disabled,
}: {
  preview: PreviewData
  ask: Ask
  onProduct: (request: ProductRequest) => void
  disabled: boolean
}) {
  // Room from each pill's left edge to the row's right one, so a panel
  // never runs past the chat on a narrow screen. Measured again when the
  // row resizes or the first pill does (its label is measured late), since
  // that moves the second.
  const row = useRef<HTMLDivElement>(null)
  const [room, setRoom] = useState<number[]>([])
  useLayoutEffect(() => {
    const node = row.current
    if (!node) return
    const measure = () => {
      const box = node.getBoundingClientRect()
      // A hidden copy measures zero; that isn't a width.
      if (box.width === 0) return
      setRoom(
        [...node.children].map(
          (pill) => box.right - pill.getBoundingClientRect().left
        )
      )
    }
    measure()
    const seen = new ResizeObserver(measure)
    seen.observe(node)
    if (node.firstElementChild) seen.observe(node.firstElementChild)
    return () => seen.disconnect()
  }, [])
  const fit = (index: number, width: number) =>
    Math.min(width, room[index] ?? width)

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
    </div>
  )
}
