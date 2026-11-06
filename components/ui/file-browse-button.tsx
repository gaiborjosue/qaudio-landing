"use client"

import type { ComponentProps } from "react"
import { Paperclip, type LucideIcon } from "lucide-react"

// Bencho's Attach files tile (bencho.dev), MIT, see bencho.dev/licence.
// Shared by product and metadata sheets; `note` adds a quieter second line,
// and `icon` changes the paperclip.
// Uses the Upload dropzone styles in app/globals.css inside an .upl root.
export function FileBrowseButton({
  children = "Attach files",
  note,
  icon: Icon = Paperclip,
  className = "",
  ...props
}: ComponentProps<"button"> & { note?: string; icon?: LucideIcon }) {
  return (
    <button
      {...props}
      type="button"
      className={`upl-zone upl-attach ${className}`}
    >
      <span className="upl-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="upl-say">
        <b>{children}</b>
        {note && <span>{note}</span>}
      </span>
    </button>
  )
}
