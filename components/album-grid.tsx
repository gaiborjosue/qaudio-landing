"use client"

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react"
import styles from "./album-grid.module.css"

// Records from the store, drawn as a square-dot halftone. Decorative only.
const COVERS = [
  "/covers/muddy-waters-best-of.webp",
  "/covers/king-crimson-court-of-the-crimson-king.webp",
  "/covers/dire-straits-brothers-in-arms.webp",
  "/covers/ray-brown-trio-red-hot.webp",
  "/covers/daria-zawialow-helsinki.webp",
  "/covers/peter-wolf-midnight-souvenirs.webp",
  "/covers/lady-pank.webp",
]

const INK = "#2e2e2e"
const PAPER = "#fcfcfc"
// The cover itself shows softly under a lighter halftone, so the art stays
// readable and the dots read as print texture.
const PHOTO_ALPHA = 0.6
const DOT_ALPHA = 0.5
const WAVE_MS = 900
// Width of the hover wave's crest, in dots.
const WAVE_BAND = 3.2

type Rect = { left: number; top: number; right: number; bottom: number }
type Placement = { cover: number; col: number; row: number; span: number }
type Layout = {
  key: string
  cell: number
  originY: number
  fade: number
  covers: Placement[]
  shades: { col: number; row: number }[]
}
type Wave = { x: number; y: number; start: number; reach: number }
type CoverState = {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  // Dots per side, and each dot's cell in device pixels.
  n: number
  cellPx: number
  image: HTMLImageElement | null
  tone: Float32Array | null
  wave: Wave | null
}

// Seeded so one visit's arrangement holds steady through resizes.
function seeded(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const noise = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

function arrange(
  width: number,
  height: number,
  avoid: Rect,
  seed: number
): Layout {
  // Matches the 640px breakpoint in faq-section.module.css.
  const phone = width <= 640
  const target = phone ? 48 : width >= 900 ? 72 : 64
  const cols = Math.max(4, Math.round(width / target))
  const cell = width / cols
  const fade = phone ? 56 : 88
  const pad = cell * 0.5
  // A grid line runs just above the content, so the top band holds whole
  // rows (the section padding in faq-section.module.css counts on this).
  const originY = ((((avoid.top - pad) % cell) + cell) % cell) - cell
  const rows = Math.ceil((height - originY) / cell)

  // Cells clear of the content, the outer columns, and the faded edges.
  const open = (col: number, row: number) => {
    if (col < 1 || col >= cols - 1) return false
    const x = col * cell
    const y = originY + row * cell
    if (y < fade * 0.5 || y + cell > height - fade * 0.5) return false
    return (
      x + cell <= avoid.left - pad ||
      x >= avoid.right + pad ||
      y + cell <= avoid.top - pad + 0.5 ||
      y >= avoid.bottom + pad
    )
  }

  // Every cover is shown. They sit in the quarters around the content, kept
  // to the outer 40% on each side so the middle stays clear. Larger sleeves
  // go first, to diagonal quarters, then the rest go smaller so both bands
  // stay balanced. A sleeve that won't fit in its quarter shrinks, then tries
  // the other quarters, and only then the middle. If they still don't all
  // fit, the layout retries with fewer large sleeves.
  const attempt = (largeCount: number) => {
    const rand = seeded(seed)
    const taken = new Set<number>()
    const fits = (col: number, row: number, span: number) => {
      for (let dy = 0; dy < span; dy++)
        for (let dx = 0; dx < span; dx++)
          if (
            !open(col + dx, row + dy) ||
            taken.has((row + dy) * cols + col + dx)
          )
            return false
      return true
    }
    const pool = COVERS.map((_, index) => index).sort(() => rand() - 0.5)
    const quarters = [
      ...(rand() < 0.5 ? [0, 3, 1, 2] : [1, 2, 0, 3]),
      ...(rand() < 0.5 ? [0, 3, 1, 2] : [1, 2, 0, 3]),
    ]
    const large = phone ? [2] : [3, 2]
    const small = phone ? [1] : [2, 1]
    const midY = (avoid.top + avoid.bottom) / 2
    const covers: Placement[] = []
    const spotsFor = (span: number, quarter: number | null) => {
      const spots: [number, number][] = []
      for (let row = 0; row <= rows - span; row++)
        for (let col = 0; col <= cols - span; col++) {
          if (quarter !== null) {
            const cx = (col + span / 2) * cell
            const cy = originY + (row + span / 2) * cell
            const side = quarter % 2 === 1 ? cx > width * 0.6 : cx < width * 0.4
            if (!side || cy > midY !== quarter >= 2) continue
          }
          if (fits(col, row, span)) spots.push([col, row])
        }
      return spots
    }
    pool.forEach((cover, index) => {
      const preferred = index < largeCount ? large : small
      const order = rand() < 0.6 ? preferred : [...preferred].reverse()
      const sizes = [...new Set([...order, 1])]
      const home = quarters[index % quarters.length]
      for (const zone of [home, 0, 1, 2, 3, null])
        for (const span of sizes) {
          const spots = spotsFor(span, zone)
          if (!spots.length) continue
          const [col, row] = spots[Math.floor(rand() * spots.length)]
          // Reserve a one-cell margin so covers never touch.
          for (let dy = -1; dy <= span; dy++)
            for (let dx = -1; dx <= span; dx++)
              taken.add((row + dy) * cols + col + dx)
          covers.push({ cover, col, row, span })
          return
        }
    })
    return { covers, taken }
  }
  let best = attempt(4)
  for (let largeCount = 3; largeCount >= 0; largeCount--) {
    if (best.covers.length === COVERS.length) break
    const next = attempt(largeCount)
    if (next.covers.length > best.covers.length) best = next
  }
  const { covers, taken } = best

  // A few faintly filled cells, as on a drafting grid.
  const rand = seeded(seed + 1)
  const shades: Layout["shades"] = []
  for (let tries = 0; shades.length < 7 && tries < 200; tries++) {
    const col = Math.floor(rand() * cols)
    const row = Math.floor(rand() * rows)
    if (open(col, row) && !taken.has(row * cols + col)) {
      taken.add(row * cols + col)
      shades.push({ col, row })
    }
  }

  const key = [width, height, avoid.left, avoid.top, avoid.right, avoid.bottom]
    .map(Math.round)
    .join(",")
  return { key, cell, originY, fade, covers, shades }
}

const images = new Map<string, Promise<HTMLImageElement>>()
function loadCover(src: string) {
  let image = images.get(src)
  if (!image) {
    const element = new Image()
    element.decoding = "async"
    element.src = src
    image = element.decode().then(() => element)
    images.set(src, image)
  }
  return image
}

// Ink per dot (0 paper … 1 solid), with vinyl sleeve wear baked in.
const tones = new Map<string, Float32Array>()
function toneGrid(image: HTMLImageElement, n: number, cover: number) {
  const id = `${cover}@${n}`
  const cached = tones.get(id)
  if (cached) return cached
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = n
  const context = canvas.getContext("2d", { willReadFrequently: true })!
  context.imageSmoothingQuality = "high"
  context.drawImage(image, 0, 0, n, n)
  const { data } = context.getImageData(0, 0, n, n)
  const light = new Float32Array(n * n)
  for (let i = 0; i < light.length; i++)
    light[i] =
      (data[i * 4] * 0.2126 +
        data[i * 4 + 1] * 0.7152 +
        data[i * 4 + 2] * 0.0722) /
      255
  // Stretch levels so dark and pale sleeves both keep their detail.
  const sorted = Float32Array.from(light).sort()
  const low = sorted[Math.floor(sorted.length * 0.02)]
  const range = Math.max(sorted[Math.floor(sorted.length * 0.98)] - low, 0.1)
  const tone = new Float32Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      let ink = (1 - clamp01((light[i] - low) / range)) ** 1.15
      // Ring wear where the record presses, uneven around the circle.
      const u = (x + 0.5) / n - 0.5
      const v = (y + 0.5) / n - 0.5
      const ring = (Math.hypot(u, v) - 0.46) / 0.022
      const arc = 0.5 + 0.5 * Math.sin(Math.atan2(v, u) * 2 + cover * 1.7)
      ink *= 1 - Math.exp(-ring * ring) * arc * 0.55
      // Scuffed edges and paper grain.
      const edge = Math.min(x, y, n - 1 - x, n - 1 - y)
      if (edge === 0) ink *= 0.25 + noise(i + cover) * 0.55
      else if (edge === 1 && noise(i * 7 + cover) < 0.25) ink *= 0.55
      ink += (noise(i * 3 + cover * 11) - 0.5) * 0.05
      tone[i] = clamp01(ink) * 0.94
    }
  }
  tones.set(id, tone)
  return tone
}

function draw(state: CoverState, now: number) {
  const { canvas, context, image, tone, n, cellPx } = state
  if (!tone) return
  context.globalAlpha = 1
  context.fillStyle = PAPER
  context.fillRect(0, 0, canvas.width, canvas.height)
  if (image) {
    context.globalAlpha = PHOTO_ALPHA
    context.imageSmoothingQuality = "high"
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
  }
  context.globalAlpha = DOT_ALPHA
  context.fillStyle = INK
  // Dots snap to whole device-pixel cells, always leaving at least a 1px gap.
  const maxDot = cellPx - 1
  const marginPx = Math.round((canvas.width - n * cellPx) / 2)
  const wave = state.wave
  let radius = 0
  let strength = 0
  if (wave) {
    const progress = (now - wave.start) / WAVE_MS
    if (progress >= 1) state.wave = null
    else {
      radius = (1 - (1 - progress) ** 1.5) * wave.reach
      strength = 1 - progress ** 2
    }
  }
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let ink = tone[y * n + x]
      let shiftX = 0
      let shiftY = 0
      if (wave && strength > 0) {
        // A short wave packet: crests flip the dither and push dots out.
        const dx = x - wave.x
        const dy = y - wave.y
        const distance = Math.hypot(dx, dy) || 1
        const ring = (distance - radius) / WAVE_BAND
        const swell =
          Math.exp(-ring * ring * 0.3) * Math.cos(ring * 1.8) * strength
        if (swell > 0) ink += (1 - 2 * ink) * swell * 0.75
        shiftX = (dx / distance) * swell * cellPx
        shiftY = (dy / distance) * swell * cellPx
      }
      if (ink < 0.04) continue
      const dot = Math.max(
        1,
        Math.min(maxDot, Math.round(maxDot * Math.sqrt(ink)))
      )
      const inset = (cellPx - dot) >> 1
      const left = marginPx + x * cellPx + inset + Math.round(shiftX)
      const top = marginPx + y * cellPx + inset + Math.round(shiftY)
      context.fillRect(left, top, dot, dot)
    }
  }
}

export function AlbumGrid({ avoid }: { avoid: RefObject<HTMLElement | null> }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<Layout | null>(null)

  // Fit the grid to the section and place covers around the content.
  useEffect(() => {
    const root = rootRef.current
    const content = avoid.current
    if (!root || !content) return
    const seed = (Math.random() * 2 ** 32) >>> 0
    const observer = new ResizeObserver(() => {
      const box = root.getBoundingClientRect()
      const rect = content.getBoundingClientRect()
      const next = arrange(
        box.width,
        box.height,
        {
          left: rect.left - box.left,
          top: rect.top - box.top,
          right: rect.right - box.left,
          bottom: rect.bottom - box.top,
        },
        seed
      )
      setLayout((previous) => (previous?.key === next.key ? previous : next))
    })
    observer.observe(root)
    observer.observe(content)
    return () => observer.disconnect()
  }, [avoid])

  // Draw each cover, then animate only while a hover wave is running.
  useEffect(() => {
    const root = rootRef.current
    if (!root || !layout) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const canvases = [
      ...root.querySelectorAll<HTMLCanvasElement>("canvas[data-index]"),
    ]
    const states: CoverState[] = []
    let frame = 0
    let disposed = false

    for (const canvas of canvases) {
      const placement = layout.covers[Number(canvas.dataset.index)]
      const size = placement.span * layout.cell - 1
      canvas.width = canvas.height = Math.round(size * dpr)
      const context = canvas.getContext("2d")
      if (!context) continue
      // Halftone pitch in CSS px (finer on single-cell sleeves), rounded to
      // whole device pixels per dot.
      const pitch =
        (placement.span === 1 ? 2.5 : 3) - (layout.cell >= 60 ? 0 : 0.5)
      const cellPx = Math.max(2, Math.round(pitch * dpr))
      const state: CoverState = {
        canvas,
        context,
        n: Math.floor(canvas.width / cellPx),
        cellPx,
        image: null,
        tone: null,
        wave: null,
      }
      states.push(state)
      loadCover(COVERS[placement.cover])
        .then((image) => {
          if (disposed) return
          state.image = image
          state.tone = toneGrid(image, state.n, placement.cover)
          draw(state, performance.now())
          canvas.dataset.ready = "true"
        })
        .catch(() => {})
    }

    const tick = (now: number) => {
      let running = false
      for (const state of states) {
        if (!state.wave) continue
        draw(state, now)
        running ||= state.wave !== null
      }
      frame = running ? requestAnimationFrame(tick) : 0
    }

    // The wave starts where the pointer enters (or taps) the sleeve.
    const startWave = (event: PointerEvent) => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
      const state = states.find((item) => item.canvas === event.currentTarget)
      if (!state?.tone) return
      const now = performance.now()
      if (state.wave && now - state.wave.start < WAVE_MS * 0.5) return
      const box = state.canvas.getBoundingClientRect()
      const x = ((event.clientX - box.left) / box.width) * state.n
      const y = ((event.clientY - box.top) / box.height) * state.n
      const far = Math.hypot(Math.max(x, state.n - x), Math.max(y, state.n - y))
      state.wave = { x, y, start: now, reach: far + WAVE_BAND * 4 }
      if (!frame) frame = requestAnimationFrame(tick)
    }
    for (const canvas of canvases)
      canvas.addEventListener("pointerenter", startWave)

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      for (const canvas of canvases)
        canvas.removeEventListener("pointerenter", startWave)
    }
  }, [layout])

  const cell = layout?.cell ?? 72
  const originY = layout?.originY ?? 0
  return (
    <div
      ref={rootRef}
      className={styles.grid}
      aria-hidden="true"
      style={
        layout
          ? ({
              "--cell": `${cell}px`,
              "--grid-y": `${originY}px`,
              "--fade": `${layout.fade}px`,
            } as CSSProperties)
          : undefined
      }
    >
      <div className={styles.lines}>
        {layout?.shades.map(({ col, row }) => (
          <span
            key={`${col}-${row}`}
            className={styles.shade}
            style={{
              left: col * cell + 1,
              top: originY + row * cell + 1,
              width: cell - 1,
              height: cell - 1,
            }}
          />
        ))}
      </div>
      {layout?.covers.map(({ cover, col, row, span }, index) => (
        <canvas
          key={`${layout.key}-${cover}`}
          data-index={index}
          className={styles.cover}
          style={{
            left: col * cell + 1,
            top: originY + row * cell + 1,
            width: span * cell - 1,
            height: span * cell - 1,
          }}
        />
      ))}
    </div>
  )
}
