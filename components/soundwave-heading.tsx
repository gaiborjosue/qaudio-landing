import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import styles from "./cable-heading.module.css"

// A sound wave in the cable headings' ink, drawn as a recording's
// waveform: rounded bars, each a slice's loudness, so neighbors move
// together. A few notes, each a sharp attack and a smooth decay, the
// loudest near the middle, then a fade to dots. Heights in the drawing's
// units, left to right; it's anchored at the right, so narrow rows keep
// the loudest part.
const BARS = [
  7, 22, 12, 12, 8, 7, 5, 14, 33, 28, 24, 18, 11, 11, 13, 25, 23, 15, 12, 8, 30,
  62, 50, 35, 24, 20, 17, 10, 15, 37, 35, 25, 16, 13, 11, 28, 24, 18, 12, 10, 7,
  4, 2, 2,
]
const GAP = 19.5
const MIDDLE = 42
const START = 884 - (BARS.length - 1) * GAP

const WAVE = BARS.map(
  (height, index) => `M${START + index * GAP} ${MIDDLE - height / 2}v${height}`
).join("")

/**
 * A heading row: the title, then a sound wave running right from it,
 * fading in beside the title like the cable headings.
 */
export function SoundwaveHeading({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cn(styles.row, className)}>
      {children}
      <svg
        className={styles.cable}
        viewBox="0 0 900 84"
        preserveAspectRatio="xMaxYMid slice"
        fill="none"
        aria-hidden="true"
        focusable="false"
      >
        <path d={WAVE} stroke="#171717" strokeWidth="5" strokeLinecap="round" />
      </svg>
    </div>
  )
}
