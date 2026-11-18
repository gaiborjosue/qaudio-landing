"use client"

import {
  useEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react"
import { Toaster, type SileoOptions } from "sileo"
import { dismissCurrentToast } from "./admin-toast"
import styles from "./admin-toaster.module.css"

// Sileo's toasts, in the admin's monochrome: a black pill with white type.
const OPTIONS: Partial<SileoOptions> = { fill: "#111" }

const toastOf = (node: EventTarget | null) =>
  node instanceof Element
    ? node.closest<HTMLElement>("[data-sileo-toast]")
    : null

// Sileo opens and holds a toast only while the pointer is over it; these
// stand in for the pointer.
const hold = (toast: HTMLElement) =>
  toast.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }))
const release = (toast: HTMLElement | null) =>
  toast?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }))

/**
 * Where the admin's toasts appear (admin-toast.ts fires them). Keyboard
 * focus opens and holds a toast the way hovering does, and Escape closes
 * it and hands focus back. The top toasts sit just under `header`.
 */
export function AdminToaster({ header }: { header: HTMLElement | null }) {
  const root = useRef<HTMLDivElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const node = root.current
    if (!header || !node) return
    const place = () => {
      const bottom = header.getBoundingClientRect().bottom
      if (bottom > 0) node.style.setProperty("--toast-top", `${bottom}px`)
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(header)
    return () => observer.disconnect()
  }, [header])

  const onFocus = (event: FocusEvent) => {
    const toast = toastOf(event.target)
    if (!toast || toastOf(event.relatedTarget) === toast) return
    const from = event.relatedTarget
    if (from instanceof HTMLElement && !toastOf(from)) returnTo.current = from
    hold(toast)
  }

  const onBlur = (event: FocusEvent) => {
    const toast = toastOf(event.target)
    if (!toast || toastOf(event.relatedTarget) === toast) return
    release(toast)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const toast = toastOf(event.target)
    if (event.key !== "Escape" || !toast) return
    event.preventDefault()
    release(toast)
    dismissCurrentToast()
    const back = returnTo.current
    returnTo.current = null
    if (back?.isConnected) back.focus()
  }

  // A toast's button closes it. Let go of it first, or Sileo would keep
  // holding the toasts that follow as if it were still hovered.
  const onClickCapture = (event: ReactMouseEvent) => {
    const target = event.target
    if (target instanceof Element && target.closest("[data-sileo-button]"))
      release(toastOf(target))
  }

  return (
    <div
      ref={root}
      className={styles.toaster}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onClickCapture={onClickCapture}
    >
      <Toaster position="top-center" options={OPTIONS} />
    </div>
  )
}
