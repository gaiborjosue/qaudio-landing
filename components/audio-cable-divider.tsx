import styles from "./contact-footer.module.css"

// Original vector artwork: a Kimber Kable–style interconnect, two bundles of
// fine copper wire in clear jackets twisted around each other, ending in one
// Kimber-style RCA plug.

type Point = { x: number; y: number }

// Parses the absolute M/C/S commands the cable paths use into cubic curves.
function cubics(d: string) {
  const tokens = d.match(/[MCS]|-?\d*\.?\d+/g) ?? []
  const curves: [Point, Point, Point, Point][] = []
  let command = ""
  let current: Point = { x: 0, y: 0 }
  let control: Point = current
  for (let index = 0; index < tokens.length;) {
    if (/[MCS]/.test(tokens[index])) command = tokens[index++]
    const point = () => ({
      x: Number(tokens[index++]),
      y: Number(tokens[index++]),
    })
    if (command === "M") {
      current = control = point()
      continue
    }
    // S reflects the previous curve's second control point.
    const first =
      command === "S"
        ? { x: 2 * current.x - control.x, y: 2 * current.y - control.y }
        : point()
    const second = point()
    const end = point()
    curves.push([current, first, second, end])
    control = second
    current = end
  }
  return curves
}

// Evenly spaced points along the path, with the unit tangent at each.
function along(d: string, spacing: number) {
  const polyline: Point[] = []
  for (const [p0, p1, p2, p3] of cubics(d)) {
    for (let step = polyline.length ? 1 : 0; step <= 48; step++) {
      const t = step / 48
      const u = 1 - t
      const weights = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
      polyline.push({
        x: weights.reduce((sum, w, i) => sum + w * [p0, p1, p2, p3][i].x, 0),
        y: weights.reduce((sum, w, i) => sum + w * [p0, p1, p2, p3][i].y, 0),
      })
    }
  }
  const samples: { point: Point; tangent: Point }[] = []
  let travelled = 0
  let next = 0
  for (let i = 1; i < polyline.length; i++) {
    const a = polyline[i - 1]
    const b = polyline[i]
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (!length) continue
    const tangent = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
    while (next <= travelled + length) {
      const f = (next - travelled) / length
      samples.push({
        point: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f },
        tangent,
      })
      next += spacing
    }
    travelled += length
  }
  return samples
}

// A polyline as an absolute move and relative lines, rounded to tenths and
// written short (-0.5 as "-.5") to keep the markup small.
function polyline(points: Point[]) {
  const tenths = points.map(({ x, y }) => ({
    x: Math.round(x * 10),
    y: Math.round(y * 10),
  }))
  const short = (value: number) => String(value / 10).replace(/^(-?)0\./, "$1.")
  let d = `M${short(tenths[0].x)} ${short(tenths[0].y)}l`
  for (let i = 1; i < tenths.length; i++) {
    const dx = tenths[i].x - tenths[i - 1].x
    const dy = tenths[i].y - tenths[i - 1].y
    d += `${i > 1 ? " " : ""}${short(dx)} ${short(dy)}`
  }
  return d
}

// Clear jackets over fine copper wire, like Kimber's copper cables (one of the
// site's few deliberate color exceptions; see AGENTS.md). The half turns
// behind are a touch darker, enough to show depth where the bundles cross
// without a visible step where they meet.
const FRONT = {
  edge: "#b2643f",
  jacket: "#fce8dc",
  wire: "#d8783f",
  gap: "#f5bf9c",
}
const BACK = {
  edge: "#a65b38",
  jacket: "#f5dccc",
  wire: "#cc6f3a",
  gap: "#ecb08b",
}
// Samples per piece: one lens length, half a turn of the twist.
const STEPS = 8

// Two bundles twisted into a helix, seen from the side. Each bundle's offset
// from the cable's center is a sine of the distance along it, half a turn
// apart, so they cross at every pinch, in a chain of lenses `lens` long. A
// bundle is in front for the half turn around each crossing and behind for
// the half turn around the edges, so it's drawn in pieces, back ones first.
// Front pieces run one sample past each end to hide the joins. Stacked
// strokes of one path draw each bundle's jacket edges and wires.
function Helix({
  id,
  d,
  width,
  lens,
}: {
  id: string
  d: string
  width: number
  lens: number
}) {
  const band = width * 0.46
  const amplitude = (width - band) / 2
  const samples = along(d, lens / STEPS)
  let front = ""
  let back = ""
  for (const turn of [0, 1]) {
    for (let piece = 0; (piece - 0.5) * STEPS < samples.length - 1; piece++) {
      const behind = (piece + turn) % 2 === 1
      const reach = STEPS / 2 + (behind ? 0 : 1)
      const first = Math.max(0, piece * STEPS - reach)
      const last = Math.min(samples.length - 1, piece * STEPS + reach)
      if (last <= first) continue
      const points = samples
        .slice(first, last + 1)
        .map(({ point, tangent }, index) => {
          const offset =
            amplitude * Math.sin(Math.PI * ((first + index) / STEPS + turn))
          return {
            x: point.x - tangent.y * offset,
            y: point.y + tangent.x * offset,
          }
        })
      if (behind) back += polyline(points)
      else front += polyline(points)
    }
  }
  const stack = (href: string, palette: typeof FRONT) => (
    <>
      <use href={href} stroke={palette.edge} strokeWidth={band} />
      <use href={href} stroke={palette.jacket} strokeWidth={band - 1.1} />
      <use href={href} stroke={palette.wire} strokeWidth={band * 0.64} />
      <use href={href} stroke={palette.gap} strokeWidth={band * 0.44} />
      <use href={href} stroke={palette.wire} strokeWidth={band * 0.22} />
    </>
  )
  return (
    <>
      <defs>
        <path id={`${id}-front`} d={front} />
        <path id={`${id}-back`} d={back} />
      </defs>
      <g
        opacity=".08"
        transform="translate(0 3)"
        stroke="#000"
        strokeWidth={band}
        strokeLinecap="round"
      >
        <use href={`#${id}-back`} />
        <use href={`#${id}-front`} />
      </g>
      <g strokeLinejoin="round">{stack(`#${id}-back`, BACK)}</g>
      <g strokeLinejoin="round">
        {stack(`#${id}-front`, FRONT)}
        {/* A glint on the jackets in front, toward the light above. */}
        <use
          href={`#${id}-front`}
          stroke="#fff"
          strokeOpacity=".75"
          strokeWidth={band * 0.12}
          transform={`translate(0 ${-band * 0.3})`}
        />
      </g>
    </>
  )
}

// Vertical gradients that shade the plug's parts as cylinders.
const CYLINDERS = {
  black: ["#050505", "#0c0c0c", "#2c2c2c", "#151515", "#080808"],
  white: ["#8c8c8c", "#d2d2d2", "#fafafa", "#e2e2e2", "#a6a6a6"],
  chrome: ["#555", "#a4a4a4", "#fcfcfc", "#cfcfcf", "#787878"],
}
const KNURL = Array.from(
  { length: 15 },
  (_, i) => `M${6 + i * 1.5}-10.4v20.8`
).join("")

// A Kimber-style RCA plug pointing along +x: a knurled black body, black and
// white bands, then a chrome ground shell around the center pin. It's drawn
// rotated 150°, so highlights sit on +y, the side that ends up facing up.
function RcaPlug({ id, transform }: { id: string; transform: string }) {
  const fill = (name: keyof typeof CYLINDERS) => `url(#${id}-${name})`
  return (
    <g transform={transform}>
      <defs>
        {Object.entries(CYLINDERS).map(([name, stops]) => (
          <linearGradient
            key={name}
            id={`${id}-${name}`}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            {stops.map((color, index) => (
              <stop
                key={index}
                offset={[0, 0.3, 0.64, 0.82, 1][index]}
                stopColor={color}
              />
            ))}
          </linearGradient>
        ))}
      </defs>
      <rect
        x="-3"
        y="-8.5"
        width="9"
        height="17"
        rx="2.5"
        fill={fill("black")}
      />
      <rect x="4" y="-11" width="27" height="22" rx="3" fill={fill("black")} />
      <path d={KNURL} stroke="#000" strokeOpacity=".55" strokeWidth=".6" />
      <rect
        x="62"
        y="-2.6"
        width="18"
        height="5.2"
        rx="2.6"
        fill={fill("chrome")}
        stroke="#5e5e5e"
        strokeWidth=".5"
      />
      <rect x="31" y="-10" width="16" height="20" fill={fill("black")} />
      <rect x="35" y="-10" width="7.5" height="20" fill={fill("white")} />
      <rect
        x="47"
        y="-8.5"
        width="19"
        height="17"
        rx="1.5"
        fill={fill("chrome")}
      />
      <path d="M65.3-8.4v16.8" stroke="#505050" strokeWidth="1.2" />
    </g>
  )
}

function Cable({ compact = false }: { compact?: boolean }) {
  const id = compact ? "cable-compact" : "cable-wide"
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
      <Helix
        id={id}
        d={path}
        width={compact ? 15 : 14}
        lens={compact ? 24 : 22}
      />
      <RcaPlug
        id={id}
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
