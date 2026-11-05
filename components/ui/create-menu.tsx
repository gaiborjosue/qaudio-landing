"use client"

/* Create menu, from Bencho (bencho.dev). MIT, see bencho.dev/licence.
   Its stylesheet is the "Create menu" block at the end of app/globals.css.

   Local changes, all of them marked where they happen:
   · exported as `CreateMenu` (it was `Create`; the crt- class names stay)
   · the rows are props: each has an icon, a label and what it does
     (`onSelect`), and the panel's height follows how many there are
   · Motion comes from `motion/react`, the package this project already
     uses (framer-motion's current name)
   · keyboard: Escape closes it and focus goes back to the pill, opening
     moves focus to the first row, and the shut panel is `inert`, so its
     invisible rows can't be tabbed to
   · the label is re-measured whenever it is laid out (ResizeObserver), and
     a zero width is ignored, so a copy rendered while hidden by a media
     query measures itself once it is shown
   · under reduced motion the shape's spring becomes a short ease, matching
     the 160ms the stylesheet already gives its CSS transitions
   · a `disabled` prop for the pill
   · it lives in a row of pills, so it no longer reserves a square and
     centres in it: the stage is just the pill (still sized by its
     label), and the panel opens from one of the pill's corners — top or
     bottom (`side`), left or right (`align`) — to `panelWidth`, over
     whatever is beside, below or above it
   · the glyph is a prop (`icon`), so the same menu can be Edit
   · a row can open a second view inside the panel instead of running
     (`view`): the shape grows to `viewHeight`, a back button returns to
     the rows, and focus moves in and back with it
   · or the panel holds its own content instead of rows (`panel`, at its
     own height), such as the Flows menu's switches

   Only the Create study is here; the toggle and the list the header
   below mentions stayed behind. */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { motion, useReducedMotion } from "motion/react"
import { ChevronLeft, Plus, type LucideIcon } from "lucide-react"

/* ══ Liquid ═══════════════════════════════════════════════
   Three metaball studies: a toggle, a reorderable list, and
   a create menu.

   RECONSTRUCTED. The original file was destroyed; this is
   rebuilt against the surviving stylesheet, which specifies
   the geometry, the layering and the timing exactly. The
   behaviour matches what index.css and the catalog demos
   require. The original's internal reasoning is not
   recoverable and is not reproduced here.

   ── the shared constraint ───────────────────────────────
   Everything on a filtered layer must be OPAQUE. The goo
   filter thresholds alpha, so a translucent fill under it
   disappears. That is why each of these has two layers: an
   opaque blob layer that carries the filter, and an unfiltered
   layer above it carrying the text — antialiased type would
   be eaten by the same threshold. */

/* ── inlined from lab/motionkit ──────────────────────── */
/* ══ liquid ═══════════════════════════════════════════════
   Shared parts for the Framer Motion layer: one spring, one
   goo filter, one velocity→skew binding.

   ── why the filter is a hook ────────────────────────────
   The filter is embedded in each component's own return, but
   its id CANNOT be a literal. Every block here renders twice
   at once — once in the wall card, once in the detail overlay
   — and duplicate SVG ids do not scope, they collide: the
   second instance silently steals the first one's filter.
   useId() gives each mount its own name.

   ── what the goo can and cannot do ──────────────────────
   This is feGaussianBlur + feColorMatrix, not a shader. The
   matrix multiplies alpha by `cut` and subtracts half of it,
   so alpha below 0.5 lands on zero and everything above 0.536
   is fully opaque. That hard edge is what fuses nearby shapes
   into one blob — and it is also why this must never touch
   text: glyph antialiasing lives entirely below 0.5, so type
   under this filter loses its edges and then itself. */

/* the elastic, as specified: ζ = 14 / (2·√(220·0.5)) ≈ 0.67,
   so it overshoots about 6% before it settles. A deliberate
   bounce, not a wobble. */
const LIQUID = {
  type: "spring" as const,
  stiffness: 220,
  damping: 14,
  mass: 0.5,
}

/* Non-drag blocks reuse the same feel without the overshoot,
   so a toggle does not bounce like a dragged card. */
/* ── the same liquid, without the overshoot ────────────────
   For shapes whose corner radius is animating: a spring that
   passes its target drags the radius past it too, and corners
   that dip under and come back read as a wobble rather than
   as a bounce.

   NOT just LIQUID with more damping, which is what this was.
   Raising damping alone to 30 against the same stiffness put
   ζ at 1.43 — comfortably overdamped, so it stopped
   overshooting by creeping: about 470ms to settle, against
   LIQUID's 290ms. It read as slow because it was.

   Stiffness comes up with the damping instead, which holds ζ
   at 1.03 — no overshoot, and it lands in about 180ms. */
const LIQUID_STILL = { ...LIQUID, stiffness: 420, damping: 30 }

/* Added here: what the shape runs on under reduced motion, the
   same 160ms the stylesheet's reduced-motion rule gives the
   rest of the menu. */
const STILL = { duration: 0.16, ease: "easeOut" as const }

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v))

/* ══ 3 · Create ═══════════════════════════════════════════
   One shape, and no filter on it — the other studies fuse two
   or more shapes, this has exactly one, so a blur could only
   damage it. The liquid here is entirely in the timing: the
   press sinks, and the spread starts while the sink is still
   running so there is never a still frame.

   The pill's width is measured from its own label and written
   back as --pill-w, so the label can change without the shape
   jumping. */

export type CreateMenuItem = {
  icon: LucideIcon
  label: string
  /** What the row does; the menu closes first. */
  onSelect?: () => void
  /** Or a second view the row opens inside the panel. `close` shuts the
      menu and hands focus back to the pill. */
  view?: { title: string; render: (close: () => void) => ReactNode }
}

/* Changed here from a fixed four: 34px rows with 2px between
   them, inside 12px of padding top and bottom — 166 for four,
   the number the panel was drawn at. */
const panelHeight = (rows: number) => 24 + rows * 34 + (rows - 1) * 2

/* Added here: a row's view renders as its own component, so the
   menu hands it `close` as a prop instead of calling into it
   (`close` touches the pill's ref) while the menu renders. */
function ViewBody({
  render,
  close,
}: {
  render: (close: () => void) => ReactNode
  close: () => void
}) {
  return render(close)
}

/* ── the menu's corners, and there are three ───────────────
   The panel is 28, the rows inside it are cut to 28 less the
   10px inset — concentric, which is what makes a row look like
   it belongs in the panel rather than merely sitting in one —
   and the shut pill is a 38px button, so 19 is round for it.

   One knob moves all three because they are one relationship:
   turn it down and the panel, the pill and the rows square off
   together. Each is capped at half its own height, past which
   a bigger number draws the same shape. */
const CRT_CORNER = 20
const CRT_MAX = 40

export function CreateMenu({
  items,
  label = "Create",
  icon: Glyph = Plus,
  disabled = false,
  corner = CRT_CORNER,
  align = "start",
  side = "bottom",
  panelWidth = 212,
  viewHeight = 360,
  panel: content,
  pillLabel,
}: {
  items: CreateMenuItem[]
  label?: string
  icon?: LucideIcon
  disabled?: boolean
  corner?: number
  /** The pill's corner the panel opens from: left or right edge… */
  align?: "start" | "end"
  /** …and below the pill's top or above its bottom. */
  side?: "bottom" | "top"
  /** The open panel's width; it may cover what is beside the pill. */
  panelWidth?: number
  /** The open panel's height while a row's view shows. */
  viewHeight?: number
  /** Added here: the panel's own content in place of rows, at `height`. */
  panel?: { height: number; render: (close: () => void) => ReactNode }
  /** Added here: the pill's accessible name, when it says more than `label`. */
  pillLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [sink, setSink] = useState(false)
  /* Added here: which row's view is showing, if any, and which
     row to hand focus back to when it closes. */
  const [view, setView] = useState<number | null>(null)
  const back = useRef<number | null>(null)
  const still = useReducedMotion()
  const custom = content !== undefined

  const panel = useRef<HTMLDivElement | null>(null)
  const pill = useRef<HTMLButtonElement | null>(null)
  const say = useRef<HTMLSpanElement | null>(null)
  const beat = useRef(0)

  const [sayW, setSayW] = useState(96)
  /* ── MEASURE TWICE: ONCE NOW, ONCE THE FONT IS REAL ────────
     .crt-say clips whatever it cannot fit, so this width being
     even slightly short takes the right edge off the last
     letter — and it was short two different ways.

     The rounding: offsetWidth is an integer and the label is
     not. "Create" measures 42.46 and comes back 42. The +1 is
     the fix; the error is always under a pixel so a pixel
     always covers it, and the pill is centred on the label so
     the spare costs nothing.

     The race, which is the one that made it intermittent: a
     layout effect runs before a webfont has swapped in, so on
     a cold cache this measured "Create" in the FALLBACK face
     and then froze that number for good. Warm cache measured
     Inter and looked fine — same code, different result, which
     is why it only cut the word sometimes. So measure again
     when the fonts are actually ready. */
  useLayoutEffect(() => {
    const el = say.current
    if (!el) return
    let live = true
    /* Added here: a copy hidden by a media query (or on a hidden
       page) lays out at zero; that is not a width, so it is
       skipped, and the observer measures again once it shows. */
    const measure = () => {
      if (live && el.offsetWidth > 0) setSayW(el.offsetWidth + 1)
    }
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
    const seen = new ResizeObserver(measure)
    seen.observe(el)
    return () => {
      live = false
      seen.disconnect()
    }
  }, [label])

  useEffect(
    () => () => {
      window.clearTimeout(beat.current)
    },
    []
  )

  /* No close button and no title bar — anywhere but the menu
     puts it away. Registered only while it is open, and in an
     effect, so the very press that opened it cannot close it
     on the same click. */
  useEffect(() => {
    if (!open) return
    /* Added here: open, focus goes to the first row — or, coming
       back from a view, to the row that opened it; in a view, to
       the view's first control. */
    if (view !== null) {
      panel.current
        ?.querySelector<HTMLElement>(
          ".crt-view-body :is(input, button, [tabindex='0'])"
        )
        ?.focus()
    } else if (custom) {
      /* Added here: the panel's own content takes focus at its first
         control. */
      panel.current
        ?.querySelector<HTMLElement>(".crt-content :is(input, button)")
        ?.focus()
    } else {
      const rows =
        panel.current?.querySelectorAll<HTMLElement>(".crt-item button")
      rows?.[back.current ?? 0]?.focus()
      back.current = null
    }
  }, [open, view, custom])

  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      /* ── a press by SOMEBODY, not by the page ─────────────
         This listens on the document, so it hears every press
         anywhere — including the ones other components'
         demonstrations dispatch at themselves. One component
         performing is harmless; several at once are not. On a
         page showing six of them side by side this menu was
         opened by its own demonstration and then slammed shut
         a moment later by a neighbour's, and the rest of its
         script went on clicking a row that was no longer
         there.

         "Anywhere but the menu puts it away" was always about
         a person reaching past it. A scripted press on another
         component is not somebody deciding to leave. */
      if (!e.isTrusted) return
      /* ── ASK THE VISIBLE BOX, NOT THE RESERVED ONE ───────
         This used to be panel.current.contains(target), and
         `panel` is the STAGE — the square this block reserves
         so that opening the menu does not resize the card
         under it. The stage is 305x305; the menu it holds is
         265x208. Everything in between is stage, so every
         press in it counted as a press on the menu and did
         nothing: measured at 48px of dead ground above the
         panel and 49 below, which is why closing it meant
         clicking well clear of the block rather than just off
         the menu.

         Hit-tested against the panel's own rectangle instead.
         Geometry rather than containment, because the thing
         that must be hit is smaller than the element the ref
         points at and there is no node covering only it — the
         liquid body is painted, not laid out.

         The rect is read per press rather than kept, since it
         is a different size on every frame of the open. */
      const box = panel.current
        ?.querySelector(".crt-panel")
        ?.getBoundingClientRect()
      const on =
        !!box &&
        e.clientX >= box.left &&
        e.clientX <= box.right &&
        e.clientY >= box.top &&
        e.clientY <= box.bottom
      if (!on) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", away)
    return () => document.removeEventListener("pointerdown", away)
  }, [open])

  /* Added here: shutting it from the keyboard (Escape, or a
     row) hands focus back to the pill. */
  const shut = () => {
    setOpen(false)
    setView(null)
    pill.current?.focus()
  }

  const press = () => {
    setSink(true)
    setView(null)
    window.clearTimeout(beat.current)
    /* 60ms handoff against a 120ms sink: the spread begins
       while the press is still running. It was 95, which is
       most of the sink — long enough to read as a pause before
       anything opened. */
    beat.current = window.setTimeout(() => {
      setSink(false)
      setOpen(true)
    }, 60)
  }

  /* glyph + gap + label + the padding either side */
  const pillW = 18 + 8 + sayW + 34
  const panelH = content ? content.height : panelHeight(items.length)
  const shown = open && view !== null ? items[view] : null
  const openH = shown?.view ? viewHeight : panelH

  /* the two the animation needs as NUMBERS — Framer writes
     borderRadius inline, so it cannot read a css variable */
  const panelR = clamp(corner, 0, CRT_MAX)
  const shutR = Math.min(19, panelR * (19 / CRT_CORNER))

  return (
    <motion.div
      className="crt-stage"
      data-open={open || undefined}
      data-sink={sink || undefined}
      data-align={align}
      data-side={side}
      ref={panel}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation()
          shut()
        }
      }}
      style={
        {
          "--pill-w": `${pillW}px`,
          "--panel-w": `${panelWidth}px`,
          "--panel-h": `${openH}px`,
          "--crt-r": `${clamp(corner, 0, CRT_MAX)}px`,
          /* the shut pill is 38 tall, so 19 is as round as it goes */
          "--crt-shut-r": `${Math.min(19, clamp(corner, 0, CRT_MAX) * (19 / CRT_CORNER)).toFixed(2)}px`,
          /* concentric: the panel's corner less its 10px inset,
             and no rounder than the 34px row's own half */
          "--crt-row-r": `${Math.min(17, Math.max(0, clamp(corner, 0, CRT_MAX) - 10)).toFixed(2)}px`,
        } as React.CSSProperties
      }
    >
      <div className="crt-blobs" aria-hidden="true">
        {/* LIQUID_STILL, not LIQUID. A spring past the target
            takes the corner radius with it — the corners dip
            under 28 and come back, which is a wobble, not a
            bounce. This is the one shape here that must not
            overshoot. */}
        <motion.div
          className="crt-body"
          /* Added here: the first frame takes these values as they
             are, so the shape doesn't grow in on load. */
          initial={false}
          animate={{
            /* Changed here: open, the width it is given rather
               than a fixed 212. */
            width: open ? panelWidth : pillW,
            height: open ? openH : 38,
            /* ── from the knob, not from two literals ──────
               Framer writes this inline every frame, so the
               stylesheet's `var(--r)` on .crt-body never gets
               a look in — the CSS variables set on the stage
               reach the ROWS, and this shape has to be told
               separately. Same two numbers the vars carry:
               the panel's own corner, and a 38px pill's half
               when it is shut. */
            borderRadius: open ? panelR : shutR,
          }}
          transition={still ? STILL : LIQUID_STILL}
        />
      </div>

      <button
        ref={pill}
        type="button"
        className="crt-pill"
        onClick={press}
        aria-expanded={open}
        aria-label={pillLabel}
        disabled={disabled}
        tabIndex={open ? -1 : undefined}
      >
        <span className="crt-glyph" aria-hidden="true">
          <Glyph size={16} strokeWidth={2} />
        </span>
        <span className="crt-say" style={{ width: sayW || undefined }}>
          <span ref={say}>{label}</span>
        </span>
      </button>

      <div className="crt-panel" inert={!open}>
        {shown?.view ? (
          /* Added here: a row's own view, with a way back. */
          <div className="crt-view" key={view}>
            <div className="crt-view-head">
              <button
                type="button"
                className="crt-back"
                aria-label={`Back to ${label}`}
                onClick={() => {
                  back.current = view
                  setView(null)
                }}
              >
                <ChevronLeft size={16} strokeWidth={2} aria-hidden="true" />
              </button>
              <span className="crt-view-title">{shown.view.title}</span>
            </div>
            <div className="crt-view-body">
              <ViewBody render={shown.view.render} close={shut} />
            </div>
          </div>
        ) : content ? (
          /* Added here: the panel's own content, arriving like the rows. */
          <div className="crt-content">
            <ViewBody render={content.render} close={shut} />
          </div>
        ) : (
          /* each row lights its own wash — see .crt-item button::before;
             nothing travels between them */
          <ul className="crt-menu" aria-label={label}>
            {items.map((it, i) => (
              <li
                className="crt-item"
                key={it.label}
                /* tightened with the shell. The last row used to
                   start at 162ms — after a box that now finishes
                   in 180 — so the menu kept arriving for half a
                   second after it had opened. */
                style={{ transitionDelay: open ? `${30 + i * 22}ms` : "0ms" }}
              >
                <button
                  type="button"
                  aria-haspopup={it.view ? true : undefined}
                  onClick={() => {
                    if (it.view) {
                      setView(i)
                      return
                    }
                    shut()
                    it.onSelect?.()
                  }}
                >
                  <it.icon size={16} strokeWidth={2} aria-hidden="true" />
                  {it.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </motion.div>
  )
}
