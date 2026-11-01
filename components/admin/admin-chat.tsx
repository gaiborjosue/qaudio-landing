"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { ArrowUp, ImagePlus, Square, X } from "lucide-react"
import {
  useEveAgent,
  type EveInteractionPart,
  type EveMessage,
  type EveToolPart,
  type Interaction,
  type UseEveAgentReturn,
} from "eve/react"
import { refreshSiteContent, signOut } from "@/app/admin/actions"
import {
  ChangePreview,
  SAVE_TOOLS,
  type PreviewData,
} from "@/components/admin/change-preview"
import { UPLOADS } from "@/lib/admin/schemas"
import { mediaUrl } from "@/lib/media"
import { browserSupabase } from "@/lib/supabase/browser"
import styles from "./admin.module.css"

type Agent = UseEveAgentReturn

// The agent verifies the admin's Supabase access token on every request;
// getSession() refreshes it when it's about to expire.
async function accessToken() {
  const { data } = await browserSupabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) {
    window.location.replace(new URL("/admin/login", window.location.origin))
    throw new Error("Signed out.")
  }
  return token
}

// Next patches history; going around it keeps the chat mounted while the
// address changes to the conversation's own URL.
function setAddress(path: string) {
  if (window.location.pathname === path) return
  History.prototype.replaceState.call(
    window.history,
    window.history.state,
    "",
    path
  )
}

export function AdminChat({
  sessionId,
  email,
  preview,
}: {
  sessionId?: string
  email: string
  /** Current site data the change previews build on. */
  preview: PreviewData
}) {
  const router = useRouter()
  const [, startRefresh] = useTransition()
  const refreshed = useRef(new Set<string>())

  const agent = useEveAgent({
    auth: { bearer: accessToken },
    ...(sessionId && {
      initialSession: { sessionId, streamIndex: 0 },
      resume: true,
    }),
    onSessionChange(session) {
      if (session)
        setAddress(`/admin/s/${encodeURIComponent(session.sessionId)}`)
    },
    // Saves run in the agent's own process, which can't reach Next's cache,
    // so refresh the pages a finished turn changed (and this page's previews).
    onFinish(snapshot) {
      const tags = new Set<string>()
      for (const message of snapshot.messages) {
        for (const part of message.parts) {
          if (part.type !== "tool" || part.state !== "completed") continue
          if (refreshed.current.has(part.callId)) continue
          refreshed.current.add(part.callId)
          const output = part.output as { revalidate?: unknown } | undefined
          if (!Array.isArray(output?.revalidate)) continue
          for (const tag of output.revalidate) {
            if (typeof tag === "string") tags.add(tag)
          }
        }
      }
      if (tags.size === 0) return
      startRefresh(async () => {
        await refreshSiteContent([...tags])
        router.refresh()
      })
    },
  })

  const busy = agent.status === "busy"
  const resuming = agent.status === "resuming"

  const newChat = () => {
    agent.newSession()
    setAddress("/admin")
  }

  return (
    <div className={styles.chat}>
      <header className={styles.header}>
        <Image
          src="/qaudio-logo.svg"
          alt="Q Audio"
          width={30}
          height={36}
          loading="eager"
        />
        <h1>Site assistant</h1>
        <span className={styles.email}>{email}</span>
        <button type="button" className={styles.quiet} onClick={newChat}>
          New chat
        </button>
        <form action={signOut}>
          <button type="submit" className={styles.quiet}>
            Sign out
          </button>
        </form>
      </header>

      <Conversation agent={agent} preview={preview} busy={busy} />

      {agent.error && (
        <p className={styles.error} role="alert">
          {agent.error.message}
        </p>
      )}

      <Composer agent={agent} disabled={resuming} busy={busy} />
    </div>
  )
}

function Conversation({
  agent,
  preview,
  busy,
}: {
  agent: Agent
  preview: PreviewData
  busy: boolean
}) {
  const log = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)

  // Follow new output while the reader is at the bottom.
  useEffect(() => {
    const node = log.current
    if (node && pinned.current) node.scrollTop = node.scrollHeight
  }, [agent.messages])

  return (
    <div
      ref={log}
      className={styles.log}
      role="log"
      aria-label="Conversation"
      aria-busy={busy}
      onScroll={(event) => {
        const node = event.currentTarget
        pinned.current =
          node.scrollHeight - node.scrollTop - node.clientHeight < 80
      }}
    >
      {agent.messages.length === 0 && agent.status !== "resuming" && (
        <p className={styles.empty}>
          Ask for a change: hours, a holiday closure, a product, a news post, or
          a deal.
        </p>
      )}
      {agent.messages.map((message) => (
        <MessageView
          key={message.id}
          message={message}
          agent={agent}
          preview={preview}
        />
      ))}
      {busy && (
        <p className={styles.working} role="status">
          Working…
        </p>
      )}
    </div>
  )
}

const PHOTO_LINE = /^Photo uploaded: .*$/gm

function MessageView({
  message,
  agent,
  preview,
}: {
  message: EveMessage
  agent: Agent
  preview: PreviewData
}) {
  if (message.role === "user") {
    return (
      <div className={styles.user}>
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            const text = part.text.replace(PHOTO_LINE, "").trim()
            return text ? <p key={part.id ?? index}>{text}</p> : null
          }
          if (
            part.type === "file" &&
            part.url &&
            part.mediaType.startsWith("image/")
          ) {
            return (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded photo of unknown size
              <img
                key={index}
                className={styles.sentPhoto}
                src={part.url}
                alt=""
              />
            )
          }
          return null
        })}
      </div>
    )
  }

  return (
    <div className={styles.assistant}>
      {message.parts.map((part, index) => {
        const key =
          ("id" in part && part.id) ||
          ("callId" in part && part.callId) ||
          index
        switch (part.type) {
          case "text":
            return <p key={key}>{part.text}</p>
          case "tool":
            if (part.kind === "control") return null
            if (SAVE_TOOLS.has(part.name)) {
              return (
                <ChangeCard
                  key={key}
                  part={part}
                  agent={agent}
                  preview={preview}
                />
              )
            }
            if (part.interaction?.status === "open") {
              return (
                <Prompt
                  key={key}
                  interaction={part.interaction}
                  agent={agent}
                />
              )
            }
            return <Activity key={key} part={part} />
          case "interaction":
            return <Prompt key={key} interaction={part} agent={agent} />
          default:
            return null
        }
      })}
    </div>
  )
}

function Activity({ part }: { part: EveToolPart }) {
  const failed = part.state === "failed"
  return (
    <p className={styles.activity}>
      {part.label}
      {failed && ` — ${part.error?.message ?? "failed"}`}
    </p>
  )
}

const CHANGE_STATUS: Partial<Record<EveToolPart["state"], string>> = {
  streaming: "Preparing",
  requested: "Preparing",
  approval: "Waiting for approval",
  running: "Saving",
  completed: "Saved",
  rejected: "Not saved",
  failed: "Failed",
  cancelled: "Cancelled",
}

function ChangeCard({
  part,
  agent,
  preview,
}: {
  part: EveToolPart
  agent: Agent
  preview: PreviewData
}) {
  const interaction = part.interaction
  const pending = interaction?.status === "open"
  const output = part.output as { url?: unknown } | undefined
  const pageUrl =
    part.state === "completed" && typeof output?.url === "string"
      ? output.url
      : null

  return (
    <section
      className={styles.card}
      data-state={part.state}
      aria-label={part.label}
    >
      <header className={styles.cardHeader}>
        <h2>{interaction?.request.prompt ?? part.label}</h2>
        <span className={styles.status}>
          {CHANGE_STATUS[part.state] ?? part.state}
        </span>
      </header>
      {part.state !== "streaming" && part.input !== undefined && (
        <details className={styles.preview} open={pending || undefined}>
          <summary>Preview</summary>
          <ChangePreview tool={part.name} input={part.input} data={preview} />
        </details>
      )}
      {part.state === "failed" && part.error && (
        <p className={styles.error}>{part.error.message}</p>
      )}
      {pending && interaction && (
        <Options interaction={interaction} agent={agent} />
      )}
      {pending && <p className={styles.hint}>Or type what to change.</p>}
      {pageUrl && (
        <a
          className={styles.link}
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
        >
          View on the site
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      )}
    </section>
  )
}

/** An approval or question's choices; the first is the primary action. */
function Options({
  interaction,
  agent,
}: {
  interaction: Interaction
  agent: Agent
}) {
  const [sending, setSending] = useState(false)
  const answered = interaction.answer !== undefined
  const options = interaction.request.options ?? []
  if (options.length === 0) return null
  return (
    <div className={styles.options}>
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          className={
            option.style === "danger" || /deny|decline|reject/i.test(option.id)
              ? styles.secondary
              : index === 0
                ? styles.primary
                : styles.secondary
          }
          disabled={sending || answered || agent.status === "resuming"}
          title={option.description}
          onClick={async () => {
            setSending(true)
            try {
              await agent.respond([
                {
                  interactionId: interaction.interactionId,
                  optionId: option.id,
                },
              ])
            } finally {
              setSending(false)
            }
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** A question, budget check, or sign-in that isn't about a save. */
function Prompt({
  interaction,
  agent,
}: {
  interaction: Interaction | EveInteractionPart
  agent: Agent
}) {
  const { request } = interaction
  if (interaction.status !== "open") return null
  if (request.kind === "sign-in") {
    return (
      <section className={styles.card}>
        <p>{request.signIn?.instructions ?? request.prompt}</p>
        {request.signIn?.url && (
          <a className={styles.link} href={request.signIn.url}>
            Sign in
          </a>
        )}
      </section>
    )
  }
  return (
    <section className={styles.card}>
      {request.title && <h2 className={styles.promptTitle}>{request.title}</h2>}
      <p>{request.prompt}</p>
      <Options interaction={interaction} agent={agent} />
      {(request.allowFreeform || !request.options?.length) && (
        <p className={styles.hint}>Type your answer below.</p>
      )}
    </section>
  )
}

type Photo = {
  id: string
  preview: string
  status: "uploading" | "ready" | "failed"
  path?: string
  width?: number
  height?: number
}

const MAX_EDGE = 1600

async function encodePhoto(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const encode = (type: string, quality: number) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  // Browsers without WebP encoding fall back to PNG; use JPEG there instead.
  let blob = await encode("image/webp", 0.86)
  if (blob?.type !== "image/webp") blob = await encode("image/jpeg", 0.88)
  if (!blob) throw new Error("Couldn’t read that image.")
  return { blob, width, height }
}

/** Resizes a photo and uploads it to the media bucket as the admin (RLS). */
async function uploadPhoto(file: File) {
  const { blob, width, height } = await encodePhoto(file)
  const extension = blob.type === "image/webp" ? "webp" : "jpg"
  // Staged in uploads/; the save tool that uses it moves it into place.
  const path = `${UPLOADS}${crypto.randomUUID()}.${extension}`
  const { error } = await browserSupabase()
    .storage.from("media")
    .upload(path, blob, {
      contentType: blob.type,
      cacheControl: "31536000",
      upsert: false,
    })
  if (error) throw error
  return { path, width, height }
}

function Composer({
  agent,
  disabled,
  busy,
}: {
  agent: Agent
  disabled: boolean
  busy: boolean
}) {
  const [text, setText] = useState("")
  const [photos, setPhotos] = useState<Photo[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const previews = useRef(new Set<string>())

  useEffect(() => {
    const urls = previews.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const addFiles = (files: Iterable<File>) => {
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue
      const id = crypto.randomUUID()
      const preview = URL.createObjectURL(file)
      previews.current.add(preview)
      setPhotos((current) => [...current, { id, preview, status: "uploading" }])
      uploadPhoto(file).then(
        (uploaded) =>
          setPhotos((current) =>
            current.map((photo) =>
              photo.id === id
                ? { ...photo, ...uploaded, status: "ready" }
                : photo
            )
          ),
        () =>
          setPhotos((current) =>
            current.map((photo) =>
              photo.id === id ? { ...photo, status: "failed" } : photo
            )
          )
      )
    }
  }

  const removePhoto = (photo: Photo) => {
    URL.revokeObjectURL(photo.preview)
    previews.current.delete(photo.preview)
    setPhotos((current) => current.filter((item) => item.id !== photo.id))
  }

  const uploading = photos.some((photo) => photo.status === "uploading")
  const ready = photos.filter((photo) => photo.status === "ready")

  const submit = async () => {
    const lines = ready.map(
      (photo) =>
        `Photo uploaded: ${photo.path} (${photo.width}×${photo.height})`
    )
    const message = [text.trim(), ...lines].filter(Boolean).join("\n")
    if (!message || disabled || uploading) return
    const content =
      ready.length === 0
        ? message
        : [
            { type: "text" as const, text: message },
            ...ready.map((photo) => ({
              type: "file" as const,
              data: mediaUrl(photo.path!),
              mediaType: photo.path!.endsWith(".webp")
                ? "image/webp"
                : "image/jpeg",
              filename: photo.path!.split("/").pop(),
            })),
          ]
    await agent.send(content)
    for (const photo of photos) {
      URL.revokeObjectURL(photo.preview)
      previews.current.delete(photo.preview)
    }
    setPhotos([])
    setText("")
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        addFiles(event.dataTransfer.files)
      }}
    >
      {photos.length > 0 && (
        <ul className={styles.photos} aria-label="Photos to send">
          {photos.map((photo, index) => (
            <li key={photo.id} data-status={photo.status}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
              <img src={photo.preview} alt={`Photo ${index + 1}`} />
              <span className={styles.photoStatus}>
                {photo.status === "uploading"
                  ? "Uploading"
                  : photo.status === "failed"
                    ? "Failed"
                    : ""}
              </span>
              <button
                type="button"
                aria-label={`Remove photo ${index + 1}`}
                onClick={() => removePhoto(photo)}
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.inputRow}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Add photos"
          onClick={() => fileInput.current?.click()}
        >
          <ImagePlus size={20} strokeWidth={1.6} aria-hidden="true" />
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(event) => {
            addFiles(event.currentTarget.files ?? [])
            event.currentTarget.value = ""
          }}
        />
        <label className="visually-hidden" htmlFor="admin-message">
          Message
        </label>
        <textarea
          id="admin-message"
          rows={1}
          value={text}
          placeholder="Ask for a change…"
          onChange={(event) => setText(event.target.value)}
          onPaste={(event) => {
            const files = [...event.clipboardData.files]
            if (files.some((file) => file.type.startsWith("image/"))) {
              addFiles(files)
              if (!event.clipboardData.getData("text")) event.preventDefault()
            }
          }}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        {busy && (
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Stop"
            onClick={() => void agent.cancel()}
          >
            <Square size={16} aria-hidden="true" />
          </button>
        )}
        <button
          type="submit"
          className={styles.send}
          aria-label="Send"
          disabled={
            disabled || uploading || (!text.trim() && ready.length === 0)
          }
        >
          <ArrowUp size={20} aria-hidden="true" />
        </button>
      </div>
    </form>
  )
}
