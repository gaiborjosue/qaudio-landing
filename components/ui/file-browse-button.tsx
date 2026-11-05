"use client"

import type { ComponentProps } from "react"
import { Paperclip } from "lucide-react"

// Bencho's Attach files tile (bencho.dev), MIT, see bencho.dev/licence.
// Shared by product and metadata sheets.
// Uses the Upload dropzone styles in app/globals.css inside an .upl root.
export function FileBrowseButton({
  children = "Attach files",
  className = "",
  ...props
}: ComponentProps<"button">) {
  return (
    <button
      {...props}
      type="button"
      className={`upl-zone upl-attach ${className}`}
    >
      <span className="upl-icon" aria-hidden="true">
        <Paperclip size={18} strokeWidth={2} />
      </span>
      <span className="upl-say">
        <b>{children}</b>
      </span>
    </button>
  )
}
