"use client"

/* Upload dropzone, from Bencho (bencho.dev). MIT, see bencho.dev/licence.
   Its stylesheet is the "Upload dropzone" block at the end of
   app/globals.css.

   Local changes, all of them marked where they happen:
   · exported as `UploadDropzone` (it was `Upload`; the upl- class names
     stay)
   · real files. Bencho's tray of pretend files is gone: photos dragged in
     from the desktop (native drag and drop) or picked with "browse files"
     arrive through `onFiles`, the parent uploads them, and their progress
     comes back as `uploads`, so the percentage and the bar are the real
     wire rather than a pretend one
   · several files at once: the accepted ones go out together, and the box
     shows the one on the wire and how many are behind it
   · the limit is a prop, per file, and it takes images only
   · the suction is gone: a file dragged from the desktop is drawn by the
     browser, not the page, so there is no tile to pull in. The inhale and
     the gulp stay
   · a refusal shakes and says so once, plainly and in ink; the escalating
     replies are gone (this site keeps its copy minimal and monochrome)
   · the file label is ink for every kind instead of a colour per kind
   · Motion comes from `motion/react`, the package this project already
     uses (framer-motion's current name)
   · reduced motion is read through useSyncExternalStore, so the server
     render and the first client render agree
   · the progress is a labelled progressbar, and only the box's line is a
     live region, so the rolling percentage isn't read out digit by digit
   · an optional split layout puts the drop target beside an Attach files
     button with a paperclip icon, separated by "or", in the product sheet */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react"
import { motion, useAnimationControls } from "motion/react"
import { Check, Paperclip, Upload as UpIcon } from "lucide-react"

/* ══ Upload dropzone ══════════════════════════════════════
   A drop box. Carry a file into it: it uploads there — name,
   a rolling percentage, a bar — ticks, and goes back to being
   a box so you can do it again.

   ── THE BOX INHALES, AND SWALLOWS ───────────────────────
   A plain filled box, no edge. A file carried over it is
   answered before it is let go: the box grows with a small
   bounce and the arrow lifts toward the hand. Let go and the
   box gives a little gulp before the upload appears in it.

   ── ONE OF THEM IS TOO BIG ──────────────────────────────
   A file over the limit (here: or not an image) shakes the
   box and says so, and is left out; the rest go. */

/* Read once, the way the wheel and the pill nav do. A
   preference, not a live input. (Here through
   useSyncExternalStore, so the server render and the first
   client render agree.) */
const MOTION_QUERY = "(prefers-reduced-motion: reduce)"
const subscribeMotion = (onChange: () => void) => {
  const query = window.matchMedia(MOTION_QUERY)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
const useStillness = () =>
  useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => false
  )

export type DropzoneUpload = {
  id: string
  name: string
  size: number
  /** 0 to 1 */
  progress: number
  status: "uploading" | "done" | "failed"
}

const fmt = (b: number) =>
  b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.round(b / 1e3)} KB`

/* the label on the page: the name's extension, at most four letters */
const extOf = (name: string) =>
  (name.includes(".") ? (name.split(".").pop() ?? "") : "IMG")
    .slice(0, 4)
    .toUpperCase()

/* ── the file icon ─────────────────────────────────────────
   After Untitled UI's: a rounded page on a 40 grid with a thin
   grey outline and a folded corner, and the extension on a
   label that sticks out past the page's left edge. (Bencho
   coloured the label by kind; here it is ink for every kind.) */
function Page({ ext, size = 40 }: { ext: string; size?: number }) {
  return (
    <svg
      className="upl-page"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="upl-page-line"
        d="M7.75 4A3.25 3.25 0 0 1 11 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 35 39.25H11A3.25 3.25 0 0 1 7.75 36z"
      />
      <path className="upl-page-line" d="M27 .5V8a4 4 0 0 0 4 4h7.5" />
      <rect
        className="upl-page-tag"
        width="29"
        height="16"
        x="1"
        y="18"
        rx="8"
      />
      {/* 9 units on the 40 grid: the mark is part of the drawing and
          scales with it, so its size lives here, not in the stylesheet */}
      <text
        x="15.5"
        y="29.1"
        textAnchor="middle"
        fontSize={ext.length > 3 ? 7.5 : 9}
        className="upl-page-ext"
      >
        {ext}
      </text>
    </svg>
  )
}

function Roll({ value }: { value: number }) {
  const s = String(Math.round(value))
  return (
    <span className="upl-roll" aria-hidden="true">
      {s.split("").map((d, i) => (
        <span key={s.length - i} className="upl-roll-col">
          <span
            className="upl-roll-strip"
            style={{ transform: `translateY(${-Number(d)}em)` }}
          >
            {"0123456789".split("").map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
      %
    </span>
  )
}

export function UploadDropzone({
  uploads,
  onFiles,
  maxBytes,
  /* how springy the upload lands, 0..100 */
  bounce = 40,
  corner = 20,
  split = false,
}: {
  /** Files on the wire and finished, in the order they were added. */
  uploads: DropzoneUpload[]
  /** Images that passed the checks; the parent uploads them. */
  onFiles: (files: File[]) => void
  /** Largest file accepted, in bytes. */
  maxBytes: number
  bounce?: number
  corner?: number
  /** Show the drop target and file-picker button side by side. */
  split?: boolean
}) {
  const still = useStillness()
  const [over, setOver] = useState(false)
  /* what the box says when it refuses — null while it is not */
  const [refuse, setRefuse] = useState<string | null>(null)
  const [gulp, setGulp] = useState(false)
  const zone = useRef<HTMLDivElement>(null)
  const now = useRef<HTMLSpanElement>(null)
  const input = useRef<HTMLInputElement>(null)
  /* dragenter and dragleave fire for every child the file passes
     over; counting them is how the box knows it was really left */
  const depth = useRef(0)
  const shake = useAnimationControls()
  const timers = useRef<number[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach(clearTimeout)
  }, [])
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  /* ── which file the box shows ─────────────────────────────
     The one on the wire; when the last one lands, it stays a
     moment with its tick, then the box opens out again. (Derived
     from `uploads` while rendering: the parent owns the wire.) */
  const current = uploads.find((u) => u.status === "uploading") ?? null
  const behind = uploads.filter((u) => u.status === "uploading").length - 1
  const [lastId, setLastId] = useState<string | null>(null)
  const [doneId, setDoneId] = useState<string | null>(null)
  if ((current?.id ?? null) !== lastId) {
    const landed = uploads.find((u) => u.id === lastId)
    setDoneId(!current && landed?.status === "done" ? landed.id : null)
    setLastId(current?.id ?? null)
  }
  useEffect(() => {
    if (!doneId) return
    /* the file goes, ready for the next */
    const timer = window.setTimeout(() => setDoneId(null), 1500)
    return () => clearTimeout(timer)
  }, [doneId])
  const done = doneId ? (uploads.find((u) => u.id === doneId) ?? null) : null
  const f = current ?? done

  const refuseIt = (line: string) => {
    setRefuse(line)
    if (!still) {
      shake.start({ x: [0, -7, 6, -4, 2, 0], transition: { duration: 0.42 } })
    }
    later(() => setRefuse(null), 1800)
  }

  /* ── taking files ─────────────────────────────────────────
     Images under the limit go; the rest are left out, and the
     box says why. */
  const take = (list: FileList | File[]) => {
    const files = [...list]
    if (files.length === 0) return
    const images = files.filter((file) => file.type.startsWith("image/"))
    const fit = images.filter((file) => file.size <= maxBytes)
    if (images.length < files.length) refuseIt("Images only")
    else if (fit.length < images.length) {
      refuseIt(`Too big — up to ${Math.round(maxBytes / 1e6)} MB`)
    }
    if (fit.length === 0) return
    if (!still) {
      setGulp(true)
      later(() => setGulp(false), 460)
    }
    onFiles(fit)
  }

  const carriesFiles = (e: React.DragEvent) =>
    e.dataTransfer.types.includes("Files")

  /* ── the box hugs the upload ─────────────────────────────
     While a file is in it the box closes in round the upload row
     — measured, because the row is as wide as its name — and
     grows a little when the tick arrives; back to idle it opens
     out to the full drop box again. Width and height, never a
     scale, so its corner stays the corner. It shrinks inside a
     slot of fixed size, so nothing below it moves. */
  /* the box hugs whichever file it is showing, and lands back open */
  const showing = f ? `${f.id}:${current ? "up" : "done"}` : null
  useLayoutEffect(() => {
    const z = zone.current
    const n = now.current
    if (!z) return
    if (!showing || !n) {
      z.style.width = ""
      z.style.height = ""
      return
    }
    z.style.width = `${n.offsetWidth + 32}px`
    z.style.height = `${n.offsetHeight + 28}px`
  }, [showing])

  const r = Math.max(0, corner)
  const mb = Math.round(maxBytes / 1e6)

  return (
    <div
      className={split ? "upl upl-split" : "upl"}
      style={
        {
          "--upl-r": `${r}px`,
          "--upl-spring": `cubic-bezier(0.3, ${1 + (bounce / 100) * 0.9}, 0.4, 1)`,
        } as React.CSSProperties
      }
    >
      <motion.div animate={shake} className="upl-zone-wrap">
        <div
          ref={zone}
          className="upl-zone"
          data-over={over || undefined}
          data-refuse={refuse ? true : undefined}
          data-busy={f ? true : undefined}
          data-gulp={gulp || undefined}
          onDragEnter={(e) => {
            if (!carriesFiles(e)) return
            e.preventDefault()
            depth.current += 1
            setOver(true)
          }}
          onDragOver={(e) => {
            if (!carriesFiles(e)) return
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
          }}
          onDragLeave={() => {
            depth.current = Math.max(0, depth.current - 1)
            if (depth.current === 0) setOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            /* the composer under this takes drops too */
            e.stopPropagation()
            depth.current = 0
            setOver(false)
            take(e.dataTransfer.files)
          }}
        >
          {!f ? (
            <>
              <span className="upl-icon">
                <UpIcon size={18} strokeWidth={2} />
              </span>
              <span className="upl-say" role="status">
                <b>
                  {refuse ?? (over ? "Drop to upload" : "Drag photos here")}
                </b>
                <span>Up to {mb} MB each</span>
              </span>
            </>
          ) : (
            <span className="upl-now" key={f.id} ref={now}>
              <Page ext={extOf(f.name)} size={36} />
              <span className="upl-text">
                <span className="upl-name">{f.name}</span>
                <span className="upl-meta">
                  {fmt(f.size)} ·{" "}
                  {current ? (
                    <Roll value={current.progress * 100} />
                  ) : (
                    "Uploaded"
                  )}
                  {behind > 0 && ` · ${behind} more`}
                </span>
                <span
                  className="upl-track"
                  role="progressbar"
                  aria-label={`Uploading ${f.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round((current?.progress ?? 1) * 100)}
                >
                  <span
                    className="upl-bar"
                    style={{
                      transform: `scaleX(${current ? current.progress : 1})`,
                    }}
                  />
                </span>
              </span>
              {/* the tick's room is kept from the start, so the box
                  is its final size before the tick arrives */}
              <span className="upl-end">
                {!current && (
                  <span className="upl-tick">
                    <Check size={14} strokeWidth={2} />
                  </span>
                )}
              </span>
            </span>
          )}
        </div>
      </motion.div>

      {/* The product sheet offers the same file picker as a matching tile. */}
      {split && (
        <>
          <span className="upl-separator" aria-hidden="true">
            or
          </span>
          <button
            type="button"
            className="upl-zone upl-attach"
            onClick={() => input.current?.click()}
          >
            <span className="upl-icon" aria-hidden="true">
              <Paperclip size={18} strokeWidth={2} />
            </span>
            <span className="upl-say">
              <b>Attach files</b>
            </span>
          </button>
        </>
      )}

      {/* Added here: with a file on the wire the box shows the upload, so a
          refusal from the same drop is said under it instead. */}
      {refuse && f && (
        <p className="upl-or upl-note" role="status">
          {refuse}
        </p>
      )}
      {/* Where Bencho's tray of files lay: the way in without a drag. */}
      {!split && (
        <p className="upl-or">
          or{" "}
          <button
            type="button"
            className="upl-browse"
            onClick={() => input.current?.click()}
          >
            browse files
          </button>
        </p>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          take(e.currentTarget.files ?? [])
          e.currentTarget.value = ""
        }}
      />
    </div>
  )
}
