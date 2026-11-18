"use client"

import { useRef, type KeyboardEvent, type PointerEvent } from "react"
import { SCORE_MAX } from "@/lib/admin/condition-score"
import { cn } from "@/lib/utils"
import styles from "./score-slider.module.css"

const TICKS = Array.from({ length: SCORE_MAX + 1 }, (_, tick) => tick)
const at = (score: number) => `${(score / SCORE_MAX) * 100}%`

/** What each key makes of the score; null is not scored yet. */
const KEYS: Record<string, (score: number | null) => number | null> = {
  ArrowRight: (score) => (score === null ? 0 : Math.min(SCORE_MAX, score + 1)),
  ArrowUp: (score) => (score === null ? 0 : Math.min(SCORE_MAX, score + 1)),
  ArrowLeft: (score) => (score === null ? 0 : Math.max(0, score - 1)),
  ArrowDown: (score) => (score === null ? 0 : Math.max(0, score - 1)),
  Home: () => 0,
  End: () => SCORE_MAX,
  Delete: () => null,
  Backspace: () => null,
}

/**
 * A used item's condition score, 0 to 10, as a slider with a tick per
 * point: press or drag anywhere along it, or use the arrow keys (Delete
 * clears it). The thumb carries the number; with no score yet there's no
 * thumb. `tone` is the condition's color cue ("used": amber).
 */
export function ScoreSlider({
  value,
  onChange,
  tone,
  small = false,
  disabled = false,
  className,
  ...aria
}: {
  value: number | null
  onChange: (score: number | null) => void
  tone?: string
  /** The product table's size, without the 0 and 10 at its ends. */
  small?: boolean
  disabled?: boolean
  className?: string
  "aria-label"?: string
  "aria-describedby"?: string
}) {
  const track = useRef<HTMLSpanElement>(null)

  const choose = (score: number | null) => {
    if (score !== value) onChange(score)
  }

  // The nearest point to the pointer; none while the track has no size.
  const follow = (event: PointerEvent<HTMLDivElement>) => {
    const box = track.current?.getBoundingClientRect()
    if (!box?.width) return
    const ratio = (event.clientX - box.left) / box.width
    choose(Math.min(SCORE_MAX, Math.max(0, Math.round(ratio * SCORE_MAX))))
  }

  const press = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    follow(event)
  }

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) follow(event)
  }

  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = KEYS[event.key]
    if (disabled || !next || event.altKey || event.metaKey || event.ctrlKey) {
      return
    }
    event.preventDefault()
    choose(next(value))
  }

  return (
    <div
      role="slider"
      tabIndex={disabled ? -1 : 0}
      className={cn(styles.slider, small && styles.small, className)}
      data-tone={tone}
      aria-valuemin={0}
      aria-valuemax={SCORE_MAX}
      aria-valuenow={value ?? 0}
      aria-valuetext={
        value === null ? "Not scored" : `${value} out of ${SCORE_MAX}`
      }
      aria-disabled={disabled || undefined}
      {...aria}
      onPointerDown={press}
      onPointerMove={drag}
      onKeyDown={key}
    >
      {!small && (
        <span className={styles.end} aria-hidden="true">
          0
        </span>
      )}
      <span ref={track} className={styles.track} aria-hidden="true">
        {value !== null && (
          <span className={styles.fill} style={{ width: at(value) }} />
        )}
        {TICKS.map((tick) => (
          <span
            key={tick}
            className={styles.tick}
            style={{ left: at(tick) }}
            data-filled={(value !== null && tick <= value) || undefined}
          />
        ))}
        {value !== null && (
          <span className={styles.thumb} style={{ left: at(value) }}>
            {value}
          </span>
        )}
      </span>
      {!small && (
        <span className={styles.end} aria-hidden="true">
          {SCORE_MAX}
        </span>
      )}
    </div>
  )
}
