"use client"

// Installed from @react-bits/DepthCarousel-JS-CSS. See react-bits.LICENSE.md.
// Local changes: a `label` prop, a `gutter` prop for the side space reserved
// when scaling, only horizontal wheel/trackpad input moves the carousel, and
// latest props sync into refs in a layout effect instead of during render.
// For slides with content (the Sales page's featured sales): `renderItem`
// draws each slide instead of an image (slides behind the front one are
// inert), `autoHeight` keeps the cards in flow so they all take the tallest
// card's height (cardHeight becomes a minimum), card sizes may be CSS lengths
// (the math then measures the card), cards are placed from the first render
// so the server's HTML already shows the stack, and arrow keys pressed inside
// a slide stay with it.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import gsap from "gsap"
import "./DepthCarousel.css"

/**
 * @typedef {object} DepthCarouselProps
 * @property {any[]} [items] Images (`{ image, alt }` or URLs), or anything `renderItem` draws.
 * @property {number | string} [cardWidth] Pixels, or a CSS length.
 * @property {number | string} [cardHeight] Pixels, or a CSS length; a minimum with `autoHeight`.
 * @property {number} [radius]
 * @property {string} [tint]
 * @property {number} [depth]
 * @property {number} [spread]
 * @property {number} [tilt]
 * @property {"left" | "right"} [tiltDirection]
 * @property {number} [perspective]
 * @property {number} [visibleCards]
 * @property {number} [falloff]
 * @property {number} [blur]
 * @property {number} [duration]
 * @property {string} [ease]
 * @property {boolean} [autoplay]
 * @property {number} [autoplayDelay]
 * @property {boolean} [loop]
 * @property {boolean} [showControls]
 * @property {boolean} [showIndicators]
 * @property {string} [label]
 * @property {number} [gutter]
 * @property {boolean} [autoHeight]
 * @property {(item: any, index: number, active: boolean) => import("react").ReactNode} [renderItem]
 * @property {(index: number, item: any) => void} [onChange]
 * @property {string} [className]
 */

const DEFAULT_ITEMS = [
  { image: "https://picsum.photos/seed/depth1/800/1000", alt: "Slide 1" },
  { image: "https://picsum.photos/seed/depth2/800/1000", alt: "Slide 2" },
  { image: "https://picsum.photos/seed/depth3/800/1000", alt: "Slide 3" },
  { image: "https://picsum.photos/seed/depth4/800/1000", alt: "Slide 4" },
  { image: "https://picsum.photos/seed/depth5/800/1000", alt: "Slide 5" },
  { image: "https://picsum.photos/seed/depth6/800/1000", alt: "Slide 6" },
]

const clamp = (v, min, max) => Math.min(Math.max(v, min), max)
const normalizeItem = (it) =>
  typeof it === "string" ? { image: it, alt: "" } : it

// The width the math uses: cardWidth, or a CSS length's measured size.
const cardPixels = (cfg, cards) =>
  typeof cfg.cardWidth === "number"
    ? cfg.cardWidth
    : cards[0]?.offsetWidth || 300

// Card i's inline styles with the carousel at `pos`, and its tint's opacity.
function placement(i, pos, cfg, sc) {
  const n = cfg.count
  const dir = cfg.tiltDirection === "left" ? -1 : 1

  let d = i - pos
  if (cfg.loop && n > 1) {
    d = ((d % n) + n) % n
    if (d > n / 2) d -= n
  }

  const back = Math.max(0, d)
  const az = Math.abs(d)
  const shown = az <= cfg.visibleCards + 0.5

  const tz = -cfg.depth * d
  const tx = dir * cfg.spread * d
  const ry = dir * cfg.tilt * clamp(d, 0, 1)

  let opacity = d < 0 ? Math.max(0, 1 + d) : 1
  if (!shown) opacity = 0

  const brightness = Math.max(0.15, 1 - back * cfg.falloff)
  const blurPx =
    cfg.blur > 0
      ? Math.min(cfg.blur, (back / Math.max(1, cfg.visibleCards)) * cfg.blur)
      : 0
  const zi = Math.round(2000 - d * 20)
  // In-flow cards are centered by the stage's grid instead.
  const center = cfg.autoHeight ? "" : "translate(-50%, -50%) "

  return {
    card: {
      transform: `${center}scale(${sc}) translateX(${tx.toFixed(2)}px) translateZ(${tz.toFixed(2)}px) rotateY(${ry.toFixed(3)}deg)`,
      opacity: opacity.toFixed(3),
      filter: `brightness(${brightness.toFixed(3)}) blur(${blurPx.toFixed(2)}px)`,
      zIndex: String(zi),
      pointerEvents: shown && opacity > 0.05 ? "auto" : "none",
    },
    tint: clamp(back * cfg.falloff * 1.25, 0, 0.86).toFixed(3),
  }
}

/** @type {(props: DepthCarouselProps) => import("react").JSX.Element} */
const DepthCarousel = ({
  items = DEFAULT_ITEMS,
  cardWidth = 300,
  cardHeight = 380,
  radius = 18,
  tint = "#05060a",
  depth = 220,
  spread = 90,
  tilt = 22,
  tiltDirection = "right",
  perspective = 1400,
  visibleCards = 4,
  falloff = 0.2,
  blur = 6,
  duration = 700,
  ease = "power3.out",
  autoplay = false,
  autoplayDelay = 3200,
  loop = true,
  showControls = true,
  showIndicators = true,
  label = "Depth carousel",
  gutter = 120,
  autoHeight = false,
  renderItem,
  onChange,
  className = "",
}) => {
  const data = useMemo(
    () => (Array.isArray(items) ? items : []).map(normalizeItem),
    [items]
  )
  const count = data.length

  const rootRef = useRef(null)
  const stageRef = useRef(null)
  const cardRefs = useRef([])
  const overlayRefs = useRef([])

  const posRef = useRef(0)
  const focusRef = useRef(0)
  const tweenRef = useRef(null)
  const scaleRef = useRef(1)
  const cfgRef = useRef({})
  const onChangeRef = useRef(onChange)

  const dragRef = useRef(null)
  const wheelTimerRef = useRef(null)
  const autoTimerRef = useRef(null)
  const reducedRef = useRef(false)

  const [active, setActive] = useState(0)

  const cfg = {
    count,
    depth,
    spread,
    tilt,
    tiltDirection,
    visibleCards,
    falloff,
    blur,
    duration,
    ease,
    loop,
    cardWidth,
    gutter,
    autoplayDelay,
    autoHeight,
  }

  const layout = useCallback((pos) => {
    const cfg = cfgRef.current
    const n = cfg.count
    if (!n) return

    for (let i = 0; i < n; i++) {
      const el = cardRefs.current[i]
      if (!el) continue
      const { card, tint } = placement(i, pos, cfg, scaleRef.current)
      Object.assign(el.style, card)
      const ov = overlayRefs.current[i]
      if (ov) ov.style.opacity = tint
    }
  }, [])

  // Latest props for handlers and effects, synced before any of them run.
  useLayoutEffect(() => {
    onChangeRef.current = onChange
    cfgRef.current = cfg
    // Card size can change with the container, so refit the scale.
    const root = rootRef.current
    if (root && root.clientWidth) {
      const needed =
        cardPixels(cfg, cardRefs.current) + Math.abs(spread) * 2 + gutter
      scaleRef.current = clamp(root.clientWidth / needed, 0.4, 1)
      layout(posRef.current)
    }
  })

  const notify = useCallback(
    (idx) => {
      setActive(idx)
      onChangeRef.current?.(idx, data[idx])
    },
    [data]
  )

  const tweenTo = useCallback(
    (target, animate) => {
      tweenRef.current?.kill()
      const cfg = cfgRef.current
      const proxy = { p: posRef.current }
      const dur = animate && !reducedRef.current ? cfg.duration / 1000 : 0
      tweenRef.current = gsap.to(proxy, {
        p: target,
        duration: dur,
        ease: cfg.ease,
        onUpdate: () => {
          posRef.current = proxy.p
          layout(proxy.p)
        },
        onComplete: () => {
          const n = cfg.count
          if (n > 0) posRef.current = ((posRef.current % n) + n) % n
          layout(posRef.current)
        },
      })
    },
    [layout]
  )

  const setFocus = useCallback(
    (rawIndex, animate = true) => {
      const cfg = cfgRef.current
      const n = cfg.count
      if (!n) return
      const idx = cfg.loop
        ? ((rawIndex % n) + n) % n
        : clamp(rawIndex, 0, n - 1)
      let delta = idx - posRef.current
      if (cfg.loop && n > 1) {
        delta = ((delta % n) + n) % n
        if (delta > n / 2) delta -= n
      }
      tweenTo(posRef.current + delta, animate)
      if (idx !== focusRef.current) {
        focusRef.current = idx
        notify(idx)
      }
    },
    [tweenTo, notify]
  )

  const navigateBy = useCallback(
    (step) => setFocus(focusRef.current + step, true),
    [setFocus]
  )

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width
      const cfg = cfgRef.current
      const needed =
        cardPixels(cfg, cardRefs.current) + Math.abs(cfg.spread) * 2 + cfg.gutter
      scaleRef.current = clamp(w / needed, 0.4, 1)
      layout(posRef.current)
    })
    ro.observe(root)
    return () => ro.disconnect()
  }, [layout])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const onWheel = (e) => {
      const cfg = cfgRef.current
      // Vertical wheel input keeps scrolling the page or its container.
      if (cfg.count < 2 || Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      tweenRef.current?.kill()
      const raw = e.deltaX
      const delta = e.deltaMode === 1 ? raw * 24 : raw
      const step = clamp(
        delta / (cardPixels(cfg, cardRefs.current) * 0.9),
        -0.6,
        0.6
      )
      posRef.current += step
      layout(posRef.current)
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
      wheelTimerRef.current = setTimeout(
        () => setFocus(Math.round(posRef.current), true),
        130
      )
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => {
      el.removeEventListener("wheel", onWheel)
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
    }
  }, [layout, setFocus])

  const onPointerDown = useCallback((e) => {
    const cfg = cfgRef.current
    if (cfg.count < 2) return
    tweenRef.current?.kill()
    dragRef.current = {
      x: e.clientX,
      startPos: posRef.current,
      lastX: e.clientX,
      lastT: performance.now(),
      v: 0,
      moved: false,
      id: e.pointerId,
    }
  }, [])

  const onPointerMove = useCallback(
    (e) => {
      const drag = dragRef.current
      if (!drag) return
      const cfg = cfgRef.current
      const stepPx = Math.max(
        cardPixels(cfg, cardRefs.current) * 0.55 * scaleRef.current,
        40
      )
      const dx = e.clientX - drag.x
      if (!drag.moved && Math.abs(dx) > 4) {
        drag.moved = true
        rootRef.current?.setPointerCapture(drag.id)
      }
      if (!drag.moved) return
      const now = performance.now()
      const dt = Math.max(now - drag.lastT, 1)
      drag.v = (e.clientX - drag.lastX) / dt
      drag.lastX = e.clientX
      drag.lastT = now
      posRef.current = drag.startPos - dx / stepPx
      layout(posRef.current)
    },
    [layout]
  )

  const onPointerEnd = useCallback(() => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    if (!drag.moved) return
    const cfg = cfgRef.current
    const stepPx = Math.max(
      cardPixels(cfg, cardRefs.current) * 0.55 * scaleRef.current,
      40
    )
    const projected = posRef.current - (drag.v * 180) / stepPx
    setFocus(Math.round(projected), true)
  }, [setFocus])

  const onKeyDown = useCallback(
    (e) => {
      // Arrow keys inside a slide (on its links) stay there.
      if (stageRef.current?.contains(e.target)) return
      if (e.key === "ArrowLeft") {
        e.preventDefault()
        navigateBy(-1)
      } else if (e.key === "ArrowRight") {
        e.preventDefault()
        navigateBy(1)
      }
    },
    [navigateBy]
  )

  const onCardClick = useCallback(
    (index) => {
      if (dragRef.current?.moved) return
      setFocus(index, true)
    },
    [setFocus]
  )

  useEffect(() => {
    reducedRef.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (!autoplay || reducedRef.current || count < 2) return
    const root = rootRef.current
    let hovered = false
    let focused = false
    const stop = () => {
      if (autoTimerRef.current) clearInterval(autoTimerRef.current)
      autoTimerRef.current = null
    }
    const start = () => {
      stop()
      autoTimerRef.current = window.setInterval(
        () => {
          if (!hovered && !focused) navigateBy(1)
        },
        Math.max(cfgRef.current.autoplayDelay, 600)
      )
    }
    const onEnter = () => {
      hovered = true
    }
    const onLeave = () => {
      hovered = false
    }
    const onFocusIn = () => {
      focused = true
    }
    const onFocusOut = () => {
      focused = false
    }
    root?.addEventListener("mouseenter", onEnter)
    root?.addEventListener("mouseleave", onLeave)
    root?.addEventListener("focusin", onFocusIn)
    root?.addEventListener("focusout", onFocusOut)
    start()
    return () => {
      stop()
      root?.removeEventListener("mouseenter", onEnter)
      root?.removeEventListener("mouseleave", onLeave)
      root?.removeEventListener("focusin", onFocusIn)
      root?.removeEventListener("focusout", onFocusOut)
    }
  }, [autoplay, autoplayDelay, count, navigateBy])

  useEffect(() => {
    layout(posRef.current)
  }, [
    layout,
    depth,
    spread,
    tilt,
    tiltDirection,
    visibleCards,
    falloff,
    blur,
    cardWidth,
    cardHeight,
    radius,
    count,
  ])

  useEffect(
    () => () => {
      tweenRef.current?.kill()
      if (wheelTimerRef.current) clearTimeout(wheelTimerRef.current)
      if (autoTimerRef.current) clearInterval(autoTimerRef.current)
    },
    []
  )

  return (
    <div
      ref={rootRef}
      className={`depth-carousel${autoHeight ? " depth-carousel--auto" : ""} ${className}`.trim()}
      style={{ "--dc-perspective": `${perspective}px` }}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
    >
      <div className="depth-carousel__stage" ref={stageRef}>
        {data.map((item, i) => {
          // Where the card starts; layout() moves it from there. These
          // values only change with the props, so renders never undo it.
          const start = placement(i, 0, cfg, 1)
          return (
            <div
              key={i}
              className="depth-carousel__card"
              ref={(el) => (cardRefs.current[i] = el)}
              style={{
                width: cardWidth,
                height: autoHeight ? undefined : cardHeight,
                minHeight: autoHeight ? cardHeight : undefined,
                borderRadius: radius,
                ...start.card,
              }}
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={active !== i}
              onClick={() => onCardClick(i)}
            >
              {renderItem ? (
                <div className="depth-carousel__content" inert={active !== i}>
                  {renderItem(item, i, active === i)}
                </div>
              ) : (
                <img
                  className="depth-carousel__img"
                  src={item.image}
                  alt={item.alt || ""}
                  draggable={false}
                />
              )}
              <span
                className="depth-carousel__tint"
                ref={(el) => (overlayRefs.current[i] = el)}
                style={{ background: tint, opacity: start.tint }}
              />
            </div>
          )
        })}
      </div>

      {showControls && count > 1 && (
        <>
          <button
            type="button"
            className="depth-carousel__arrow depth-carousel__arrow--prev"
            aria-label="Previous slide"
            onClick={() => navigateBy(-1)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="depth-carousel__arrow depth-carousel__arrow--next"
            aria-label="Next slide"
            onClick={() => navigateBy(1)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M9 5l7 7-7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      )}

      {showIndicators && count > 1 && (
        <div
          className="depth-carousel__dots"
          role="tablist"
          aria-label="Slides"
        >
          {data.map((_, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={active === i}
              aria-label={`Go to slide ${i + 1}`}
              className={`depth-carousel__dot${active === i ? " is-active" : ""}`}
              onClick={() => setFocus(i, true)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default DepthCarousel
