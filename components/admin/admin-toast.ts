import { sileo, type SileoOptions, type SileoPosition } from "sileo"

// The admin's toasts (Sileo, drawn by admin-toaster.tsx): one morphing pill
// at a time, so a new toast takes over the one before. Chat news sits at
// the lower right where the chat column leaves room (the same width as
// RAIL_QUERY in flow-stepper.tsx), and everything else at the top center,
// under the workspace switch.

/** Where a toast belongs: beside the chat, or the tabs' page notices. */
export type ToastPlace = "chat" | "page"
export type ToastKind =
  | "success"
  | "error"
  | "warning"
  | "info"
  | "action"
  | "loading"

const WIDE = "(min-width: 1400px)"

/** How long each kind reads, unless a toast sets its own. */
const DURATION: Record<ToastKind, number | null> = {
  success: 4000,
  info: 5000,
  warning: 6000,
  error: 6000,
  action: 10000,
  loading: null,
}
/** Toasts with a button wait longer, so it can be reached. */
const WITH_BUTTON = 10000

let current: { token: number; id: string } | null = null
let tokens = 0

function position(place: ToastPlace): SileoPosition {
  return place === "chat" && window.matchMedia(WIDE).matches
    ? "bottom-right"
    : "top-center"
}

/**
 * Shows a toast and returns its token, for `dismissToast`. A button's
 * action also closes the toast.
 */
export function toast(
  kind: ToastKind,
  {
    place = "page",
    ...options
  }: Omit<SileoOptions, "position" | "type"> & { place?: ToastPlace }
) {
  const token = ++tokens
  const button = options.button && {
    title: options.button.title,
    onClick: () => {
      dismissToast(token)
      options.button?.onClick()
    },
  }
  const shown: SileoOptions = {
    ...options,
    button,
    position: position(place),
    duration:
      options.duration !== undefined
        ? options.duration
        : button && kind !== "loading"
          ? WITH_BUTTON
          : DURATION[kind],
  }
  const id =
    kind === "loading"
      ? sileo.show({ ...shown, type: "loading" })
      : sileo[kind](shown)
  current = { token, id }
  return token
}

/** Closes the toast, unless a newer one has taken its place. */
export function dismissToast(token: number) {
  if (current?.token !== token) return
  sileo.dismiss(current.id)
  current = null
}

/** Closes whatever toast is showing (Escape on a toast). */
export function dismissCurrentToast() {
  if (current) dismissToast(current.token)
}
