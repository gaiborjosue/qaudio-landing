import styles from "./contact-footer.module.css"

// Original vector artwork: a continuous instrument cable with one quarter-inch plug.
function Plug({ transform }: { transform: string }) {
  return (
    <g transform={transform}>
      <path d="M0 0h18" stroke="#222" strokeWidth="9" />
      <rect x="13" y="-8" width="38" height="16" rx="4" fill="#202020" />
      <path d="M20-5h23" stroke="#777" strokeWidth="2" />
      <path d="M17-6v12m5-12v12m5-12v12" stroke="#454545" />
      <rect x="51" y="-6" width="7" height="12" rx="1" fill="#555" />
      <path d="M58-4h22l6 4-6 4H58Z" fill="#b8b8b8" stroke="#555" />
      <path d="M60-2h19" stroke="#f3f3f3" />
      <path d="M71-4v8m6-8v8" stroke="#222" strokeWidth="2" />
    </g>
  )
}

function Cable({ compact = false }: { compact?: boolean }) {
  const path = compact
    ? "M-20 30C59 30 67 56 151 56S262 19 346 24C410 28 458 18 516 18S580 58 542 54C526 52 516 54 504 61"
    : "M-20 44C120 44 151 83 316 78S513 24 694 29 847 82 1022 69C1142 60 1208 24 1328 24S1411 64 1360 56C1343 53 1334 56 1320 64"
  return (
    <svg
      className={compact ? styles.cableMobile : styles.cableDesktop}
      viewBox={compact ? "0 0 600 115" : "0 0 1440 120"}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={path}
        stroke="#000"
        strokeOpacity=".1"
        strokeWidth="10"
        transform="translate(0 3)"
      />
      <path d={path} stroke="#171717" strokeWidth="7" strokeLinecap="round" />
      <path
        d={path}
        stroke="#626262"
        strokeWidth="1.5"
        transform="translate(0 -1.6)"
      />
      <Plug
        transform={
          compact
            ? "translate(504 61) rotate(150)"
            : "translate(1320 64) rotate(150)"
        }
      />
    </svg>
  )
}

export function AudioCableDivider() {
  return (
    <div className={styles.divider}>
      <Cable />
      <Cable compact />
    </div>
  )
}
