"use client"

import {
  Children,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react"
import DepthCarousel from "./DepthCarousel"
import styles from "./featured-sales.module.css"

// The stack's depth, roomier on wide screens. The CSS keeps twice the spread
// free beside the front card (--deal-space), so cards never need scaling.
const WIDE = { spread: 96, depth: 200, tilt: 20 }
const COMPACT = { spread: 40, depth: 140, tilt: 16 }
/** Matches the container query in featured-sales.module.css. */
const COMPACT_BELOW = 640
const PERSPECTIVE = 1400
const VISIBLE_CARDS = 3
/** The card width's clamp in featured-sales.module.css. */
const MIN_CARD = 240
const MAX_CARD = 400

/**
 * How far the cards behind reach past the front card's right edge, as seen
 * through the perspective, so the stage can shift left by half and center
 * the whole stack.
 */
function stackReach(
  count: number,
  width: number | null,
  { spread, depth, tilt }: typeof WIDE
) {
  const card =
    width === null
      ? MAX_CARD
      : Math.min(Math.max(width - 2 * spread, MIN_CARD), MAX_CARD)
  const half = card / 2
  // Looping, half of the other cards wait behind the front one.
  const behind = Math.min(Math.floor(count / 2), VISIBLE_CARDS)
  const angle = (tilt * Math.PI) / 180
  let reach = 0
  for (let d = 1; d <= behind; d++) {
    const x = spread * d + half * Math.cos(angle)
    const z = depth * d + half * Math.sin(angle)
    reach = Math.max(reach, (x * PERSPECTIVE) / (PERSPECTIVE + z) - half)
  }
  return reach
}

const renderSlide = (slide: ReactNode) => slide

/**
 * The Sales page's featured sales: one portrait card, or React Bits' Depth
 * Carousel when there are more, its cards as tall as the tallest one.
 */
export function FeaturedSales({ children }: { children: ReactNode }) {
  const slides = useMemo(() => Children.toArray(children), [children])
  const ref = useRef<HTMLDivElement>(null)
  // Unknown on the server and until measured: laid out as wide.
  const [width, setWidth] = useState<number | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width)
      // A hidden page measures zero; keep the last real width.
      if (next > 0) setWidth(next)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const stack = width !== null && width < COMPACT_BELOW ? COMPACT : WIDE
  const shift = stackReach(slides.length, width, stack) / 2

  return (
    <div
      ref={ref}
      className={styles.root}
      style={
        {
          "--deal-count": slides.length,
          "--deal-shift": `${shift.toFixed(1)}px`,
        } as CSSProperties
      }
    >
      {slides.length > 1 ? (
        <DepthCarousel
          className={styles.carousel}
          items={slides}
          renderItem={renderSlide}
          label="Featured sales"
          autoHeight
          cardWidth="var(--deal-card-w)"
          cardHeight="var(--deal-card-h)"
          radius={24}
          tint="#111"
          perspective={PERSPECTIVE}
          spread={stack.spread}
          depth={stack.depth}
          tilt={stack.tilt}
          visibleCards={VISIBLE_CARDS}
          falloff={0.14}
          blur={3}
          gutter={0}
        />
      ) : (
        <div className={styles.single}>{slides[0]}</div>
      )}
    </div>
  )
}
