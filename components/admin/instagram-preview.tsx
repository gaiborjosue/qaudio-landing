"use client"

import Image from "next/image"
import { useId, useLayoutEffect, useRef, useState } from "react"
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Heart,
  MessageCircle,
  Send,
} from "lucide-react"
import { Reorder, useReducedMotion } from "motion/react"
import {
  INSTAGRAM_FOLD,
  instagramFrame,
  type InstagramFrame,
} from "@/lib/admin/instagram"
import type {
  InstagramPhotoInput,
  InstagramPostInput,
} from "@/lib/admin/schemas"
import { mediaUrl } from "@/lib/media"
import styles from "./instagram-preview.module.css"

// Hashtags and @mentions, as Instagram links them: not inside a word, and a
// mention doesn't end on a period.
const TAG =
  /((?<![\p{L}\p{N}_])(?:#[\p{L}\p{N}_]+|@[A-Za-z0-9_](?:[A-Za-z0-9_.]*[A-Za-z0-9_])?))/u

function Linked({ text }: { text: string }) {
  return text.split(TAG).map((part, index) =>
    index % 2 ? (
      <span key={index} className={styles.tag}>
        {part}
      </span>
    ) : (
      part
    )
  )
}

/** The caption as Instagram folds it: the opening, then "more". */
function Caption({ name, text }: { name: string; text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > INSTAGRAM_FOLD
  return (
    <p className={styles.caption}>
      <strong>{name}</strong>{" "}
      <Linked
        text={open || !long ? text : text.slice(0, INSTAGRAM_FOLD).trimEnd()}
      />
      {long && !open && (
        <>
          …{" "}
          <button
            type="button"
            className={styles.more}
            onClick={() => setOpen(true)}
          >
            more
          </button>
        </>
      )}
    </p>
  )
}

/** The account's picture: the shop's logo, as on its profile. */
function Avatar({ size }: { size: number }) {
  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src="/loader-logo.svg"
        alt=""
        width={Math.round(size * 0.5)}
        height={Math.round(size * 0.6)}
      />
    </span>
  )
}

const DAY = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
})
const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
})

/** When the post shows as posted: Instagram's own short time line. */
function postedLabel(when: string, short: boolean) {
  if (when === "draft") return null
  if (when === "now") return short ? "now" : "Just now"
  const [year, month, day] = when.slice(0, 10).split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return (short ? SHORT_DAY : DAY).format(date)
}

function Photo({
  photo,
  frame,
}: {
  photo: InstagramPhotoInput
  frame: InstagramFrame
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- the media library's own photo, at its true colors and crop
    <img
      className={styles.photo}
      src={mediaUrl(photo.path)}
      alt={photo.alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={{ objectFit: frame.fit }}
    />
  )
}

/** Instagram's big heart, after a double-click on the photo. */
function Burst({ id, onDone }: { id: number; onDone: () => void }) {
  if (!id) return null
  return (
    <Heart
      key={id}
      className={styles.burst}
      fill="currentColor"
      strokeWidth={0}
      aria-hidden="true"
      onAnimationEnd={onDone}
    />
  )
}

function Story({ post, name }: { post: InstagramPostInput; name: string }) {
  const frame = instagramFrame("story", post.fit, post.photos[0])
  const time = postedLabel(post.when, true)
  return (
    <figure className={styles.story} aria-label={`Story by ${name}`}>
      <div
        className={styles.storyFrame}
        style={{ background: frame.background }}
      >
        <Photo photo={post.photos[0]} frame={frame} />
        <div className={styles.storyTop} aria-hidden="true">
          <span className={styles.progress} />
          <div className={styles.storyHead}>
            <Avatar size={32} />
            <span className={styles.name}>{name}</span>
            {time && <span className={styles.storyTime}>{time}</span>}
            <Ellipsis className={styles.end} size={22} />
          </div>
        </div>
        <div className={styles.storyBottom} aria-hidden="true">
          <span className={styles.reply}>Send message</span>
          <Heart size={26} strokeWidth={1.8} />
          <Send size={24} strokeWidth={1.8} />
        </div>
      </div>
    </figure>
  )
}

const SPRING = { type: "spring" as const, bounce: 0, duration: 0.35 }
const STILL = { duration: 0 }

/**
 * The carousel's photos in a row above the post, numbered in posting order.
 * Drag one to a new place (or focus it and press the left and right arrow
 * keys); the post follows at once. Clicking one shows it in the post.
 * `order` holds the photos' original positions, so each keeps its identity.
 */
function PhotoStrip({
  photos,
  order,
  active,
  onOrder,
  onShow,
}: {
  photos: InstagramPhotoInput[]
  order: number[]
  active: number
  /** The new order, and where the moved photo now sits. */
  onOrder: (order: number[], moved: number | null) => void
  onShow: (position: number) => void
}) {
  const list = useRef<HTMLOListElement>(null)
  const refocus = useRef<number | null>(null)
  const dragging = useRef<number | null>(null)
  // A press that became a drag isn't a click.
  const dragged = useRef(false)
  const [said, setSaid] = useState("")
  const hint = useId()
  const still = useReducedMotion()

  // React may re-insert a moved thumbnail, which drops its focus; put it back
  // once the new order is on screen.
  useLayoutEffect(() => {
    const id = refocus.current
    if (id === null) return
    refocus.current = null
    list.current?.querySelector<HTMLElement>(`[data-photo="${id}"]`)?.focus()
  }, [order])

  const reorder = (next: number[], moved: number | null) => {
    const to = moved === null ? -1 : next.indexOf(moved)
    if (to >= 0) setSaid(`Photo moved to ${to + 1} of ${next.length}.`)
    onOrder(next, to >= 0 ? to : null)
  }

  const move = (position: number, step: -1 | 1) => {
    const to = position + step
    if (to < 0 || to >= order.length) return
    const next = [...order]
    const [item] = next.splice(position, 1)
    next.splice(to, 0, item)
    refocus.current = item
    reorder(next, item)
  }

  return (
    <>
      <Reorder.Group
        ref={list}
        as="ol"
        axis="x"
        values={order}
        onReorder={(next) => reorder(next, dragging.current)}
        className={styles.strip}
        aria-label="Photo order"
      >
        {order.map((original, position) => {
          const photo = photos[original]
          return (
            <Reorder.Item
              key={original}
              as="li"
              value={original}
              className={styles.thumb}
              data-active={position === active || undefined}
              transition={still ? STILL : SPRING}
              whileDrag={{ scale: 1.08, zIndex: 2 }}
              onDragStart={() => {
                dragged.current = true
                dragging.current = original
              }}
              onDragEnd={() => {
                dragging.current = null
              }}
            >
              <button
                type="button"
                data-photo={original}
                className={styles.thumbButton}
                aria-label={`Photo ${position + 1} of ${order.length}: ${photo.alt}`}
                aria-describedby={hint}
                aria-current={position === active || undefined}
                onPointerDown={() => {
                  dragged.current = false
                }}
                onClick={() => {
                  if (dragged.current) {
                    dragged.current = false
                    return
                  }
                  onShow(position)
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                    return
                  event.preventDefault()
                  move(position, event.key === "ArrowLeft" ? -1 : 1)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a thumbnail of the media library's own photo */}
                <img
                  src={mediaUrl(photo.path)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
                <span className={styles.thumbNumber} aria-hidden="true">
                  {position + 1}
                </span>
              </button>
            </Reorder.Item>
          )
        })}
      </Reorder.Group>
      <span id={hint} className="sr-only">
        Drag, or press the left and right arrow keys, to move. Press Enter to
        show it.
      </span>
      <span className="sr-only" role="status">
        {said}
      </span>
    </>
  )
}

/** A swipe of this much of a photo's width turns to the next one. */
const SWIPE = 0.15

function Feed({
  post,
  order,
  onOrder,
  name,
}: {
  post: InstagramPostInput
  order: number[]
  onOrder?: (order: number[]) => void
  name: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const swipe = useRef<{ id: number; x: number; left: number } | null>(null)
  const [active, setActive] = useState(0)
  const [liked, setLiked] = useState(false)
  const [burst, setBurst] = useState(0)
  const still = useReducedMotion()
  const photos = order.map((index) => post.photos[index])
  // The first photo sets the carousel's shape, so a new first photo can
  // change it, as it will on Instagram.
  const frame = instagramFrame("feed", post.fit, photos[0])
  const count = photos.length
  const time = postedLabel(post.when, false)
  const caption = post.caption.trim()

  const show = (index: number, smooth = true) => {
    const node = scroller.current
    // A hidden page measures zero; that isn't a position.
    if (!node || node.clientWidth === 0) return
    const to = Math.max(0, Math.min(count - 1, index))
    node.scrollTo({
      left: to * node.clientWidth,
      behavior: smooth && !still ? "smooth" : "auto",
    })
  }

  // Touch and trackpads scroll natively; a mouse swipes by dragging.
  const endSwipe = (clientX: number) => {
    const node = scroller.current
    const drag = swipe.current
    swipe.current = null
    if (!node || !drag) return
    delete node.dataset.swiping
    const width = node.clientWidth
    if (width === 0) return
    const from = Math.round(drag.left / width)
    const moved = (clientX - drag.x) / width
    show(moved < -SWIPE ? from + 1 : moved > SWIPE ? from - 1 : from)
  }

  return (
    <>
      {onOrder && count > 1 && (
        <PhotoStrip
          photos={post.photos}
          order={order}
          active={active}
          onOrder={(next, moved) => {
            onOrder(next)
            // Follow the moved photo, so the post shows where it went.
            if (moved !== null) show(moved)
          }}
          onShow={(position) => show(position)}
        />
      )}
      <figure className={styles.post} aria-label={`Post by ${name}`}>
        <div className={styles.head}>
          <Avatar size={32} />
          <span className={styles.name}>{name}</span>
          <Ellipsis className={styles.end} size={22} aria-hidden="true" />
        </div>
        <div className={styles.frame}>
          <div
            ref={scroller}
            className={styles.media}
            {...(count > 1
              ? {
                  tabIndex: 0,
                  role: "group",
                  "aria-label": `${count} photos; swipe, or press the left and right arrow keys`,
                  "data-carousel": "",
                }
              : {})}
            onScroll={(event) => {
              const { scrollLeft, clientWidth } = event.currentTarget
              if (clientWidth > 0)
                setActive(Math.round(scrollLeft / clientWidth))
            }}
            onKeyDown={(event) => {
              if (count < 2) return
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                return
              event.preventDefault()
              show(active + (event.key === "ArrowLeft" ? -1 : 1))
            }}
            onPointerDown={(event) => {
              const node = scroller.current
              if (
                count < 2 ||
                !node ||
                event.pointerType !== "mouse" ||
                event.button !== 0
              )
                return
              swipe.current = {
                id: event.pointerId,
                x: event.clientX,
                left: node.scrollLeft,
              }
              node.setPointerCapture(event.pointerId)
              // Snapping would fight the drag; it comes back on release.
              node.dataset.swiping = ""
            }}
            onPointerMove={(event) => {
              const node = scroller.current
              const drag = swipe.current
              if (!node || drag?.id !== event.pointerId) return
              node.scrollLeft = drag.left - (event.clientX - drag.x)
            }}
            onPointerUp={(event) => {
              if (swipe.current?.id === event.pointerId) endSwipe(event.clientX)
            }}
            onPointerCancel={(event) => {
              const drag = swipe.current
              if (drag?.id === event.pointerId) endSwipe(drag.x)
            }}
            onDoubleClick={() => {
              setLiked(true)
              setBurst((value) => value + 1)
            }}
          >
            {photos.map((photo, index) => (
              <div
                // Keyed by original place, so reordering moves photos
                // instead of reloading them.
                key={order[index]}
                className={styles.slide}
                style={{
                  aspectRatio: `${frame.width} / ${frame.height}`,
                  background: frame.background,
                }}
              >
                <Photo photo={photo} frame={frame} />
              </div>
            ))}
          </div>
          <Burst id={burst} onDone={() => setBurst(0)} />
          {count > 1 && (
            <>
              <span className={styles.count} aria-hidden="true">
                {active + 1}/{count}
              </span>
              {active > 0 && (
                <button
                  type="button"
                  className={styles.arrow}
                  data-side="start"
                  aria-label="Previous photo"
                  onClick={() => show(active - 1)}
                >
                  <ChevronLeft size={16} strokeWidth={2.4} aria-hidden="true" />
                </button>
              )}
              {active < count - 1 && (
                <button
                  type="button"
                  className={styles.arrow}
                  data-side="end"
                  aria-label="Next photo"
                  onClick={() => show(active + 1)}
                >
                  <ChevronRight
                    size={16}
                    strokeWidth={2.4}
                    aria-hidden="true"
                  />
                </button>
              )}
            </>
          )}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.like}
            aria-label="Like"
            aria-pressed={liked}
            onClick={() => setLiked((value) => !value)}
          >
            <Heart
              size={24}
              strokeWidth={1.8}
              fill={liked ? "currentColor" : "none"}
              aria-hidden="true"
            />
          </button>
          <MessageCircle
            className={styles.icon}
            size={24}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          <Send
            className={styles.icon}
            size={23}
            strokeWidth={1.8}
            aria-hidden="true"
          />
          {count > 1 && (
            <span className={styles.dots} aria-hidden="true">
              {photos.map((_, index) => (
                <span
                  key={order[index]}
                  data-active={index === active || undefined}
                />
              ))}
            </span>
          )}
          <Bookmark
            className={`${styles.icon} ${styles.end}`}
            size={24}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </div>
        {caption && <Caption name={name} text={caption} />}
        {time && <p className={styles.time}>{time}</p>}
      </figure>
    </>
  )
}

/** Whether `order` lists each of `count` photos once. */
function isOrderOf(order: number[] | undefined, count: number) {
  return (
    order?.length === count &&
    order.every((index, position) => order.indexOf(index) === position) &&
    order.every(
      (index) => Number.isInteger(index) && index >= 0 && index < count
    )
  )
}

/**
 * A proposed Instagram post as Instagram shows it, centered on a quiet
 * stage: each photo fitted to the same frame the tool converts it to (the
 * crop, or the bars), in color, with Instagram's mock actions, linked
 * hashtags, and the caption folded after its opening. A carousel swipes or
 * steps with its arrows; with `arrange`, a numbered row of its photos above
 * the post reorders them by dragging. A story fills a 9:16 screen.
 */
export function InstagramPreview({
  post,
  arrange,
}: {
  post: InstagramPostInput
  /** The photos' order as original positions, while the owner may change it. */
  arrange?: { order: number[] | null; onOrder: (order: number[]) => void }
}) {
  const name = post.account?.replace(/^@+/, "") || "instagram"
  const count = post.photos.length
  const order =
    arrange?.order && isOrderOf(arrange.order, count)
      ? arrange.order
      : post.photos.map((_, index) => index)
  return (
    <div className={styles.stage}>
      {post.kind === "story" ? (
        <Story post={post} name={name} />
      ) : (
        <Feed
          post={post}
          order={order}
          onOrder={arrange?.onOrder}
          name={name}
        />
      )}
    </div>
  )
}
