"use client"

import {
  useEffect,
  useRef,
  useSyncExternalStore,
  type ComponentProps,
} from "react"
import { cn } from "cn"

// Adapted from Cult UI's Grid Beam
// (https://www.cult-ui.com/docs/components/grid-beam): soft beams of light
// that travel along a grid's lines, drawn on a canvas over the content. This
// copy is monochrome only (Cult UI's "mono" palette, darkened to read on
// white), and it can follow measured lines, such as a table's rows and
// columns, instead of an even grid. It draws only while it's active, on
// screen, and in a visible tab, and not at all under reduced motion.

type Shade = readonly [ink: number, opacity: number]

// Alternating greys per line, like the original's mono palette.
const PALETTES: Record<"light" | "dark", readonly Shade[]> = {
  light: [
    [40, 0.34],
    [70, 0.26],
    [30, 0.34],
    [60, 0.26],
  ],
  dark: [
    [200, 0.22],
    [180, 0.17],
    [195, 0.22],
    [175, 0.17],
  ],
}

/** Line positions in px from the beam's top left corner. */
export type GridBeamLines = { x: number[]; y: number[] }

const even = (count: number, size: number) =>
  Array.from({ length: Math.max(1, count) - 1 }, (_, i) =>
    Math.round(((i + 1) / count) * size)
  )

const spacing = (lines: number[], size: number) =>
  size / Math.max(1, lines.length + 1)

const smoothstep = (t: number) => t * t * (3 - 2 * t)
const gaussian = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s))

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)")
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

type Config = {
  lines?: (root: HTMLElement, box: DOMRect) => GridBeamLines
  rows: number
  cols: number
  theme: "light" | "dark"
  duration: number
  strength: number
  breathe: boolean
}

export type GridBeamProps = ComponentProps<"div"> & {
  /**
   * Measures the lines to follow, inside the root; called when it resizes.
   * Without it the beams follow an even grid of `rows` × `cols`.
   */
  lines?: Config["lines"]
  rows?: number
  cols?: number
  /** "light" for a light surface (darker beams), "dark" for a dark one. */
  theme?: Config["theme"]
  /** Runs or stops the beams. */
  active?: boolean
  /** Seconds for a beam to cross the grid. */
  duration?: number
  strength?: number
  /** A slow swell in the beams' length. */
  breathe?: boolean
}

export function GridBeam({
  children,
  className,
  lines,
  rows = 3,
  cols = 4,
  theme = "light",
  active = true,
  duration = 3,
  strength = 1,
  breathe = true,
  ...props
}: GridBeamProps) {
  const root = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const reduced = useSyncExternalStore(
    subscribeReducedMotion,
    reducedMotion,
    () => false
  )
  const running = active && !reduced

  // The loop reads the latest settings each frame.
  const config = useRef<Config>({
    lines,
    rows,
    cols,
    theme,
    duration,
    strength,
    breathe,
  })
  useEffect(() => {
    config.current = { lines, rows, cols, theme, duration, strength, breathe }
  })

  useEffect(() => {
    const node = root.current
    const surface = canvas.current
    const ctx = surface?.getContext("2d", { alpha: true })
    if (!node || !surface || !ctx || !running) return

    let width = 0
    let height = 0
    let xs: number[] = []
    let ys: number[] = []
    let frame: number | null = null
    let started = 0
    let frames = 0
    let inView = true
    let pageVisible = !document.hidden

    // A hidden page or panel measures 0×0; keep the last real size.
    const measure = () => {
      const box = node.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) return false
      const dpr = window.devicePixelRatio || 1
      if (box.width !== width || box.height !== height) {
        width = box.width
        height = box.height
        surface.width = Math.round(width * dpr)
        surface.height = Math.round(height * dpr)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }
      const { lines, rows, cols } = config.current
      const found = lines?.(node, box)
      xs = found ? found.x : even(cols, width)
      ys = found ? found.y : even(rows, height)
      return true
    }

    const rgba = (ink: number, alpha: number) =>
      `rgba(${ink},${ink},${ink},${Math.max(0, alpha).toFixed(4)})`

    // The core of a beam: its own grey, deepening (or brightening on a dark
    // surface) toward the middle.
    const beamGradient = (
      gradient: CanvasGradient,
      [ink, op]: Shade,
      gs: number,
      toward: number
    ) => {
      const step = (k: number) => Math.max(0, Math.min(255, ink + toward * k))
      gradient.addColorStop(0, "transparent")
      gradient.addColorStop(0.12, rgba(ink, op * 0.4 * gs))
      gradient.addColorStop(0.35, rgba(step(30), op * 0.8 * gs))
      gradient.addColorStop(0.5, rgba(step(50), op * gs))
      gradient.addColorStop(0.65, rgba(step(30), op * 0.8 * gs))
      gradient.addColorStop(0.88, rgba(ink, op * 0.4 * gs))
      gradient.addColorStop(1, "transparent")
      return gradient
    }

    const draw = (now: number) => {
      frame = null
      if (frames++ % 30 === 0) measure()
      if (width === 0 || height === 0) {
        frame = requestAnimationFrame(draw)
        return
      }
      const { theme, duration, strength, breathe } = config.current
      const palette = PALETTES[theme]
      const toward = theme === "light" ? -1 : 1
      const elapsed = (now - started) / 1000
      const gs = smoothstep(Math.min(1, elapsed / 0.8)) * strength
      const swell = breathe
        ? 0.85 + 0.3 * Math.sin(elapsed * 1.4) + 0.1 * Math.sin(elapsed * 2.3)
        : 1
      const cellW = spacing(xs, width)
      const cellH = spacing(ys, height)
      ctx.clearRect(0, 0, width, height)

      const along = (index: number, axis: "x" | "y") => {
        const speed = 1 + (index % 3) * (axis === "x" ? 0.12 : 0.1)
        const offset =
          axis === "x"
            ? index * 0.21 + (index % 2) * 0.35
            : index * 0.26 + (index % 2) * 0.4
        const span = axis === "x" ? duration : duration * 1.2
        return ((elapsed * speed) / span + offset) % 1
      }

      // Beams along the horizontal lines.
      ys.forEach((y, r) => {
        const shade = palette[(r + 1) % palette.length]
        const x = along(r + 1, "x") * width
        const bloomLen = cellW * 0.6 * swell
        const bloom = ctx.createRadialGradient(x, y, 0, x, y, bloomLen)
        bloom.addColorStop(0, rgba(shade[0], shade[1] * 0.3 * gs))
        bloom.addColorStop(0.4, rgba(shade[0], shade[1] * 0.12 * gs))
        bloom.addColorStop(1, "transparent")
        ctx.save()
        ctx.scale(1, 4 / bloomLen)
        ctx.fillStyle = bloom
        ctx.beginPath()
        ctx.arc(x, (y * bloomLen) / 4, bloomLen, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        const coreLen = cellW * 0.55 * swell
        ctx.strokeStyle = beamGradient(
          ctx.createLinearGradient(x - coreLen, y, x + coreLen, y),
          shade,
          gs,
          toward
        )
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x - coreLen, y)
        ctx.lineTo(x + coreLen, y)
        ctx.stroke()
      })

      // Beams along the vertical lines.
      xs.forEach((x, c) => {
        const shade = palette[(c + 2) % palette.length]
        const y = along(c + 1, "y") * height
        const bloomLen = cellH * 0.6 * swell
        const bloom = ctx.createRadialGradient(x, y, 0, x, y, bloomLen)
        bloom.addColorStop(0, rgba(shade[0], shade[1] * 0.3 * gs))
        bloom.addColorStop(0.4, rgba(shade[0], shade[1] * 0.12 * gs))
        bloom.addColorStop(1, "transparent")
        ctx.save()
        ctx.scale(4 / bloomLen, 1)
        ctx.fillStyle = bloom
        ctx.beginPath()
        ctx.arc((x * bloomLen) / 4, y, bloomLen, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()

        const coreLen = cellH * 0.55 * swell
        ctx.strokeStyle = beamGradient(
          ctx.createLinearGradient(x, y - coreLen, x, y + coreLen),
          shade,
          gs,
          toward
        )
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x, y - coreLen)
        ctx.lineTo(x, y + coreLen)
        ctx.stroke()
      })

      // A small flare where two beams meet at a crossing.
      ys.forEach((iy, r) => {
        const hx = along(r + 1, "x") * width
        xs.forEach((ix, c) => {
          const vy = along(c + 1, "y") * height
          const prox =
            gaussian((hx - ix) / cellW, 0.25) *
            gaussian((vy - iy) / cellH, 0.25)
          if (prox <= 0.05) return
          const ink = palette[(r + c) % palette.length][0]
          const radius = 3.5 * Math.sqrt(prox)
          const alpha = prox * 0.6 * gs
          const flare = ctx.createRadialGradient(ix, iy, 0, ix, iy, radius)
          flare.addColorStop(0, rgba(Math.max(0, ink + toward * 60), alpha))
          flare.addColorStop(0.5, rgba(ink, alpha * 0.4))
          flare.addColorStop(1, "transparent")
          ctx.fillStyle = flare
          ctx.beginPath()
          ctx.arc(ix, iy, radius, 0, Math.PI * 2)
          ctx.fill()
        })
      })

      frame = requestAnimationFrame(draw)
    }

    const update = () => {
      if (inView && pageVisible) {
        if (frame !== null) return
        started = performance.now()
        frames = 0
        frame = requestAnimationFrame(draw)
      } else if (frame !== null) {
        cancelAnimationFrame(frame)
        frame = null
        ctx.clearRect(0, 0, width, height)
      }
    }

    const resized = new ResizeObserver(() => measure())
    resized.observe(node)
    const seen = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting
      update()
    })
    seen.observe(node)
    const onVisibility = () => {
      pageVisible = !document.hidden
      update()
    }
    document.addEventListener("visibilitychange", onVisibility)
    measure()
    update()

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      resized.disconnect()
      seen.disconnect()
      document.removeEventListener("visibilitychange", onVisibility)
      ctx.clearRect(0, 0, width, height)
    }
  }, [running])

  return (
    <div
      ref={root}
      className={cn("relative", className)}
      data-slot="grid-beam"
      {...props}
    >
      {children}
      <canvas
        ref={canvas}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
      />
    </div>
  )
}
