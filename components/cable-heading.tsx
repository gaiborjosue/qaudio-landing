import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import styles from "./cable-heading.module.css"

// Original vector artwork in the style of the contact footer's cable. Plugs
// are drawn pointing +x from the cable's end, centered on y = 0.

/** RCA (phono) plug: one mono channel, a center pin inside a split shell. */
function RcaPlug() {
  return (
    <>
      <path d="M0-4.5 14-6v12L0 4.5Z" fill="#222" />
      <rect x="12" y="-8" width="30" height="16" rx="3" fill="#202020" />
      <path d="M16-8v16m4-16v16m4-16v16" stroke="#3a3a3a" />
      <path d="M28-5h11" stroke="#777" strokeWidth="2" />
      <path
        d="M44-1.6h27a1.6 1.6 0 0 1 0 3.2H44Z"
        fill="#c8c8c8"
        stroke="#555"
        strokeWidth=".8"
      />
      <path d="M42-7h20v14H42Z" fill="#b8b8b8" stroke="#555" />
      <path d="M47-7v14" stroke="#555" />
      <path d="M49-5h12" stroke="#f3f3f3" />
      <path d="M52 0h10" stroke="#555" />
    </>
  )
}

/** Banana plug, as on speaker cable: a sprung, bulging pin. */
function BananaPlug() {
  return (
    <>
      <path d="M0-4.5 12-6.5v13L0 4.5Z" fill="#222" />
      <rect x="10" y="-8" width="34" height="16" rx="6" fill="#202020" />
      <path d="M17-5h22" stroke="#777" strokeWidth="2" />
      <rect x="44" y="-5.5" width="8" height="11" rx="1" fill="#555" />
      <path
        d="M52-2h5c5 0 7-4.5 12.5-4.5S78-2 81-2h1.5a2 2 0 0 1 0 4H81c-3 0-6 4.5-11.5 4.5S62 2 57 2h-5Z"
        fill="#b8b8b8"
        stroke="#555"
      />
      <path d="M63-3.8c4-1.4 9-1.4 13 0" stroke="#f3f3f3" />
      <path
        d="M58-.8c4 0 6.5-2.6 11-2.6S77-.8 80-.8m-22 1.6c4 0 6.5 2.6 11 2.6S77 .8 80 .8"
        stroke="#777"
        strokeWidth=".7"
      />
    </>
  )
}

// `over` repeats the stretch of a looping cable that crosses on top, so the
// loop reads over-and-under.
const CABLES: Record<
  "rca" | "banana",
  { path: string; over?: string; plug: string; Plug: () => ReactNode }
> = {
  rca: {
    path: "M0 46C150 46 230 54 380 52S580 42 660 46C700 48 724 48 740 38C752 30 768 14 748 12C732 10.4 722 20 730 30C736 38 744 46 760 48C776 50 796 46 820 46",
    over: "M730 30C736 38 744 46 760 48",
    plug: "translate(820 46)",
    Plug: RcaPlug,
  },
  banana: {
    path: "M0 42C140 42 210 32 340 34S520 52 640 50C720 49 760 36 806 38",
    plug: "translate(806 38) rotate(4)",
    Plug: BananaPlug,
  },
}

export type CableConnector = keyof typeof CABLES

function Strand({ d, over = false }: { d: string; over?: boolean }) {
  return (
    <>
      {over ? null : (
        <path
          d={d}
          stroke="#000"
          strokeOpacity=".1"
          strokeWidth="10"
          transform="translate(0 3)"
        />
      )}
      {/* Butt ends keep a repeated stretch from capping the highlight below. */}
      <path
        d={d}
        stroke="#171717"
        strokeWidth="7"
        strokeLinecap={over ? "butt" : "round"}
      />
      <path
        d={d}
        stroke="#626262"
        strokeWidth="1.5"
        transform="translate(0 -1.6)"
      />
    </>
  )
}

/**
 * A heading row: the title, then a cable running right from it and ending
 * in a plug pointing away. The drawing is anchored at the plug; narrower
 * rows show less cable, which fades in beside the title.
 */
export function CableHeading({
  connector,
  className,
  children,
}: {
  connector: CableConnector
  className?: string
  children: ReactNode
}) {
  const { path, over, plug, Plug } = CABLES[connector]
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
        <Strand d={path} />
        {over ? <Strand d={over} over /> : null}
        <g transform={plug}>
          <Plug />
        </g>
      </svg>
    </div>
  )
}
