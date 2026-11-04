"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react"
import { createPortal } from "react-dom"
import { previewToolName } from "@/lib/admin/tool-names"
import { useRouter } from "next/navigation"
import { ArrowUp, ImagePlus, Mic, Pencil, Square, X } from "lucide-react"
import { AnimatePresence, MotionConfig, motion } from "motion/react"
import { Streamdown } from "streamdown"
import {
  useEveAgent,
  type EveInteractionPart,
  type EveMessage,
  type EveToolPart,
  type Interaction,
  type UseEveAgentReturn,
} from "eve/react"
import { parts, runs } from "eve/events"
import { refreshSiteContent, saveArrangedOrder } from "@/app/admin/actions"
import {
  ChangePreview,
  SAVE_TOOLS,
  type PreviewData,
} from "@/components/admin/change-preview"
import { SchedulePicker } from "@/components/admin/schedule-picker"
import {
  CopyAction,
  MessageAction,
  ModelInfoAction,
} from "@/components/admin/message-actions"
import { orderScope, ProductOrder } from "@/components/admin/product-order"
import type { ProductRequest } from "@/components/admin/products-view"
import { QuickMenus, type Ask } from "@/components/admin/quick-menus"
import { Steps } from "@/components/admin/steps"
import { useVoiceInput, VoiceWaveform } from "@/components/admin/voice-input"
import { ChromaticButton } from "@/components/chromatic-button"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { TooltipProvider } from "@/components/ui/tooltip"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import {
  discardUpload,
  PHOTO_MAX_BYTES,
  uploadPhoto,
} from "@/lib/admin/photo-upload"
import {
  instagramPostInputSchema,
  reorderProductsInputSchema,
} from "@/lib/admin/schemas"
import {
  APPROVED_PHOTO_ORDER,
  approvedOrderMessage,
  arrangedApprovals,
  PHOTO_ORDER,
} from "@/lib/admin/instagram-arrange"
import { INSTAGRAM_SCHEDULE_DAYS } from "@/lib/admin/instagram"
import { withUploadedPhotos } from "@/lib/admin/chat-photos"
import { formatStoreDateTime } from "@/lib/admin/store-time"
import { mediaUrl } from "@/lib/media"
import { browserSupabase } from "@/lib/supabase/browser"
import styles from "./admin.module.css"

type Agent = UseEveAgentReturn

// Shown at the top of every chat, as if the assistant opened it. The owner is
// the only admin; the agent's instructions know not to greet a second time.
const WELCOME =
  "Hello Dariusz! This is Tune, your Q-Audio assistant. I can help you with anything in your website or even post on Instagram, just ask me 😊!"

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

export function AdminChat({
  active,
  sessionId,
  preview,
  actionsTarget,
  onSession,
  onProduct,
}: {
  active: boolean
  sessionId?: string
  /** Current site data the change previews build on. */
  preview: PreviewData
  /** Where New chat goes: the workspace header. */
  actionsTarget: HTMLElement | null
  /** The conversation's session id once there is one; none after New chat. */
  onSession: (sessionId?: string) => void
  /** Opens a product in the Products tab (the quick menus' Product items). */
  onProduct: (request: ProductRequest) => void
}) {
  const router = useRouter()
  const [, startRefresh] = useTransition()
  const refreshed = useRef(new Set<string>())
  const [ending, setEnding] = useState(false)
  const [voiceReset, setVoiceReset] = useState(0)

  const agent = useEveAgent({
    auth: { bearer: accessToken },
    ...(sessionId && {
      initialSession: { sessionId, streamIndex: 0 },
      resume: true,
    }),
    onSessionChange(session) {
      if (session) onSession(session.sessionId)
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

  // Chats are disposable: long-term memory keeps what matters, so New chat
  // ends the server session instead of leaving it behind.
  const newChat = async () => {
    setVoiceReset((current) => current + 1)
    setEnding(true)
    try {
      if (agent.session) await agent.end()
    } catch {
      // Already ended or unreachable; start fresh either way.
    }
    agent.newSession()
    onSession(undefined)
    setEnding(false)
  }

  // Quick actions send the owner's opening line, as if typed, and the agent
  // takes it from there. An Edit choice adds a hidden "Item:" line naming the
  // exact item (the bubble drops it, like "Photo uploaded:").
  const ask: Ask = (text, item) =>
    void agent.send(item ? `${text}\nItem: ${item}` : text)

  // The composer's text lives here so a sent message's Edit can put its
  // words back in the field.
  const [draft, setDraft] = useState("")
  const field = useRef<HTMLTextAreaElement>(null)
  const edit = (text: string) => {
    setDraft(text)
    field.current?.focus()
  }

  return (
    // Morphs and other Motion animations go instant under reduced motion.
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        {actionsTarget &&
          createPortal(
            <button
              type="button"
              className={styles.quiet}
              disabled={ending}
              onClick={newChat}
            >
              New chat
            </button>,
            actionsTarget
          )}
        <div className={styles.workspace}>
          <div className={styles.chat}>
            <Conversation
              agent={agent}
              preview={preview}
              busy={busy}
              onEdit={edit}
            />

            {agent.error && (
              <p className={styles.error} role="alert">
                {agent.error.message}
              </p>
            )}

            {/* Quick actions, at the top left of the message field. Outside
                the composer's form, so Enter in a list's search can't send
                the message. Stroke on: the white menus need their hairline
                on this light grey page. */}
            <div
              className={styles.quickActions}
              role="group"
              aria-label="Quick actions"
              data-stroke="on"
            >
              <QuickMenus
                preview={preview}
                ask={ask}
                onProduct={onProduct}
                disabled={resuming || ending}
              />
            </div>

            <Composer
              agent={agent}
              active={active}
              voiceReset={voiceReset}
              disabled={resuming || ending}
              busy={busy}
              text={draft}
              onText={setDraft}
              field={field}
            />
          </div>
        </div>
      </TooltipProvider>
    </MotionConfig>
  )
}

function Conversation({
  agent,
  preview,
  busy,
  onEdit,
}: {
  agent: Agent
  preview: PreviewData
  busy: boolean
  onEdit: (text: string) => void
}) {
  const ownerSaved = ownerSavedOrders(agent.messages)
  const preapproved = arrangedApprovals(agent.messages)
  // Match each text part to the run that produced it. Session-wide model
  // settings would mislabel older replies after an automatic model switch.
  const modelByPart = useMemo(() => {
    const modelByRun = new Map(
      runs(agent.view).map((run) => [run.runId, run.modelId])
    )
    return new Map(
      parts(agent.view, { kind: "text" }).map((part) => [
        part.partId,
        modelByRun.get(part.runId),
      ])
    )
  }, [agent.view])
  return (
    // Each of the owner's messages anchors its turn near the top, the reply
    // streams in below it and is followed while the reader stays at the
    // live edge, and a reopened chat opens at its last turn.
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
      <MessageScroller>
        <MessageScrollerViewport aria-label="Conversation">
          <MessageScrollerContent className={styles.log} aria-busy={busy}>
            <MessageScrollerItem>
              <Message className={styles.message}>
                <MessageContent className={styles.reply}>
                  <p>{WELCOME}</p>
                </MessageContent>
              </Message>
            </MessageScrollerItem>
            {agent.messages.map((message) => (
              <MessageScrollerItem
                key={message.id}
                messageId={message.id}
                scrollAnchor={message.role === "user"}
              >
                <MessageView
                  message={message}
                  agent={agent}
                  preview={preview}
                  ownerSaved={ownerSaved}
                  preapproved={preapproved}
                  modelByPart={modelByPart}
                  onEdit={onEdit}
                />
              </MessageScrollerItem>
            ))}
            {busy && (
              <MessageScrollerItem>
                <p className={styles.working} role="status">
                  Working…
                </p>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton className="motion-reduce:transition-none" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

// Lines meant for the agent, not the bubble: uploaded photos, the item an
// Edit-menu choice names, a product order the owner arranged and saved on a
// reorder card ("Order:" is the earlier form), and a carousel's photos in
// the order the owner arranged them on its card (lib/admin/
// instagram-arrange.ts). Older chats also carry what the owner saved or
// asked to draft in the chat's former product editor and table.
const HIDDEN_LINE = new RegExp(
  `^(Photo uploaded|Item|Order|Order saved|Product saved|Products updated|Editor|${PHOTO_ORDER}|${APPROVED_PHOTO_ORDER}): .*$`,
  "gm"
)
const ORDER_SAVED = /^Order saved: (.+)$/m

/**
 * Reorder cards the owner rearranged and saved themselves, by tool call: an
 * "Order saved:" message belongs to the latest reorder card before it. Read
 * from the conversation, so a reopened chat shows them saved too.
 */
function ownerSavedOrders(messages: readonly EveMessage[]) {
  const saved = new Map<string, string[]>()
  let card: string | null = null
  for (const message of messages) {
    for (const part of message.parts) {
      if (
        part.type === "tool" &&
        previewToolName(part.name) === "reorder_products"
      ) {
        card = part.callId
      } else if (message.role === "user" && part.type === "text" && card) {
        const line = part.text.match(ORDER_SAVED)?.[1]
        if (!line) continue
        try {
          const input = reorderProductsInputSchema.safeParse(JSON.parse(line))
          if (input.success) saved.set(card, input.data.product_ids)
        } catch {
          // Not an order; leave the card as it is.
        }
        card = null
      }
    }
  }
  return saved
}

/** A message's words; the owner's without the lines meant for the agent. */
function messageText(message: EveMessage) {
  return message.parts
    .flatMap((part) => {
      if (part.type !== "text") return []
      return message.role === "user"
        ? part.text.replace(HIDDEN_LINE, "").trim()
        : part.text.trim()
    })
    .filter(Boolean)
    .join("\n\n")
}

type ReplyPart = EveMessage["parts"][number]

/** A working step: a call that's neither a change card nor an open question.
 * Older chats' product editor and table calls read as steps too. */
const isStep = (part: ReplyPart): part is EveToolPart =>
  part.type === "tool" &&
  !SAVE_TOOLS.has(part.name) &&
  part.interaction?.status !== "open"

/**
 * A reply's parts in order, with each run of working steps gathered into
 * one. Parts that draw nothing (control calls, reasoning, files) are left
 * out, so they don't split a run.
 */
function replyRuns(parts: readonly ReplyPart[]) {
  const runs: (
    | { part: ReplyPart; index: number; steps?: undefined }
    | { part?: undefined; index?: undefined; steps: EveToolPart[] }
  )[] = []
  parts.forEach((part, index) => {
    if (part.type === "tool" && part.kind === "control") return
    if (part.type === "reasoning" || part.type === "file") return
    if (isStep(part)) {
      const last = runs.at(-1)
      if (last?.steps) last.steps.push(part)
      else runs.push({ steps: [part] })
      return
    }
    runs.push({ part, index })
  })
  return runs
}

function MessageView({
  message,
  agent,
  preview,
  ownerSaved,
  preapproved,
  modelByPart,
  onEdit,
}: {
  message: EveMessage
  agent: Agent
  preview: PreviewData
  ownerSaved: Map<string, string[]>
  preapproved: Set<string>
  modelByPart: ReadonlyMap<string, string | undefined>
  onEdit: (text: string) => void
}) {
  const displayed = withUploadedPhotos(message)
  const text = messageText(displayed)

  if (message.role === "user") {
    const photos = displayed.parts.flatMap((part) =>
      part.type === "file" && part.url && part.mediaType.startsWith("image/")
        ? [part.url]
        : []
    )
    return (
      <Message align="end" className={styles.message}>
        <MessageContent>
          {photos.length > 0 && (
            <div className={styles.sentPhotos}>
              {photos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded photo of unknown size
                <img key={url} className={styles.sentPhoto} src={url} alt="" />
              ))}
            </div>
          )}
          {text && (
            <>
              <Bubble align="end" variant="muted">
                <BubbleContent className={styles.bubble}>{text}</BubbleContent>
              </Bubble>
              <MessageFooter>
                <CopyAction text={text} />
                <MessageAction label="Edit" onClick={() => onEdit(text)}>
                  <Pencil aria-hidden="true" />
                </MessageAction>
              </MessageFooter>
            </>
          )}
        </MessageContent>
      </Message>
    )
  }

  // Copy waits for the reply's text to finish arriving.
  const writing = message.parts.some(
    (part) => part.type === "text" && part.state === "streaming"
  )
  const models = [
    ...new Set(
      message.parts.flatMap((part) => {
        if (part.type !== "text" || !part.id || !part.text.trim()) return []
        const model = modelByPart.get(part.id)
        return model ? [model] : []
      })
    ),
  ]

  return (
    <Message className={styles.message}>
      <MessageContent className={styles.reply}>
        {replyRuns(message.parts).map(({ part, index, steps }) => {
          if (steps) return <Steps key={steps[0].callId} parts={steps} />
          const key =
            ("id" in part && part.id) ||
            ("callId" in part && part.callId) ||
            index
          switch (part.type) {
            case "text":
              return (
                <Streamdown
                  key={key}
                  className={styles.markdown}
                  mode={part.state === "streaming" ? "streaming" : "static"}
                  isAnimating={part.state === "streaming"}
                  // No code, table, or image buttons; links open as plain
                  // links (only the owner reads this chat).
                  controls={false}
                  linkSafety={{ enabled: false }}
                  skipHtml
                >
                  {part.text}
                </Streamdown>
              )
            case "tool":
              if (part.kind === "control") return null
              if (SAVE_TOOLS.has(part.name)) {
                return (
                  <ChangeCard
                    key={key}
                    part={part}
                    agent={agent}
                    preview={preview}
                    ownerSaved={ownerSaved.get(part.callId)}
                    preapproved={preapproved.has(part.callId)}
                  />
                )
              }
              // Not a step, so it's a question still waiting for an answer.
              return part.interaction ? (
                <Prompt
                  key={key}
                  interaction={part.interaction}
                  agent={agent}
                />
              ) : null
            case "interaction":
              return <Prompt key={key} interaction={part} agent={agent} />
            default:
              return null
          }
        })}
        {text && !writing && (
          <MessageFooter className={styles.replyFooter}>
            <CopyAction text={text} />
            <ModelInfoAction models={models} />
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  )
}

// A news proposal's published_at, for the schedule picker's starting point.
function newsPublishAt(input: unknown) {
  const value = (input as { published_at?: unknown } | undefined)?.published_at
  return typeof value === "string" ? value : null
}

// An Instagram proposal's scheduled time ("draft" and "now" aren't times).
function instagramWhen(input: unknown) {
  const value = (input as { when?: unknown } | undefined)?.when
  return typeof value === "string" && value.includes("T") ? value : null
}

const INSTAGRAM_LINK = /^https:\/\/(www\.)?instagram\.com\//

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
  ownerSaved,
  preapproved = false,
}: {
  part: EveToolPart
  agent: Agent
  preview: PreviewData
  /** The order the owner arranged on this reorder card and saved. */
  ownerSaved?: string[]
  /** An Instagram post the owner approved on the card before, by its order. */
  preapproved?: boolean
}) {
  const interaction = part.interaction
  const pending = !ownerSaved && interaction?.status === "open"
  const output = part.output as { url?: unknown } | undefined
  const pageUrl =
    part.state === "completed" && typeof output?.url === "string"
      ? output.url
      : null

  // A proposed product order can be rearranged here. A changed order is the
  // owner's own decision, so "Save this order" saves it directly (a Server
  // Action, as the admin) rather than asking for a second approval, then
  // tells the agent with a hidden "Order saved:" line. That message
  // withdraws the agent's proposal, and this card shows the saved order.
  const [arranged, setArranged] = useState<string[] | null>(null)
  const [saving, startSaving] = useTransition()
  const [saveError, setSaveError] = useState<string | null>(null)
  const order =
    pending && previewToolName(part.name) === "reorder_products"
      ? reorderProductsInputSchema.safeParse(part.input).data
      : undefined
  const known = new Set(preview.products.map((product) => product.id))
  const sortable = order?.product_ids.every((id) => known.has(id)) ?? false
  const changed =
    order !== undefined &&
    arranged !== null &&
    arranged.join() !== order.product_ids.join()
  const shownInput =
    ownerSaved && part.input
      ? { ...(part.input as object), product_ids: ownerSaved }
      : changed
        ? { ...order, product_ids: arranged }
        : part.input

  const saveArranged = () => {
    if (!order || !arranged) return
    const input = { ...order, product_ids: arranged }
    setSaveError(null)
    startSaving(async () => {
      const result = await saveArrangedOrder(input)
      if ("error" in result) {
        setSaveError(result.error)
        return
      }
      await agent.send(
        `I saved ${orderScope(order, preview.taxonomy)} in the order I arranged.\nOrder saved: ${JSON.stringify(input)}`
      )
    })
  }

  // A carousel's photos can be rearranged on its preview. The tool's input
  // can't change once proposed, so "Approve in this order" sends the order to
  // the agent, which proposes the same post with it; that card approves
  // itself when it matches exactly (lib/admin/instagram-arrange.ts).
  const [photoOrder, setPhotoOrder] = useState<number[] | null>(null)
  const [sendingOrder, setSendingOrder] = useState(false)
  const instagram =
    pending && previewToolName(part.name) === "save_instagram_post"
      ? instagramPostInputSchema.safeParse(part.input).data
      : undefined
  const carousel =
    instagram?.kind === "feed" && instagram.photos.length > 1
      ? instagram
      : undefined
  const arrangedPhotos =
    carousel &&
    photoOrder?.length === carousel.photos.length &&
    photoOrder.some((original, position) => original !== position)
      ? photoOrder.map((original) => carousel.photos[original])
      : null
  const photoOrderLine = arrangedPhotos
    ? `\n${PHOTO_ORDER}: ${JSON.stringify(arrangedPhotos)}`
    : ""

  const approveArranged = async () => {
    if (!arrangedPhotos) return
    setSendingOrder(true)
    try {
      await agent.send(approvedOrderMessage(arrangedPhotos))
    } finally {
      setSendingOrder(false)
    }
  }

  // Answer the re-proposal of a post approved by its order, once.
  const autoApproved = useRef(false)
  const resuming = agent.status === "resuming"
  useEffect(() => {
    if (
      !preapproved ||
      autoApproved.current ||
      resuming ||
      interaction?.status !== "open" ||
      interaction.answer !== undefined ||
      !interaction.request.options?.some((option) => option.id === "approve")
    )
      return
    autoApproved.current = true
    agent
      .respond([
        { interactionId: interaction.interactionId, optionId: "approve" },
      ])
      .catch(() => {
        autoApproved.current = false
      })
  }, [preapproved, resuming, interaction, agent])
  const approving = preapproved && pending

  return (
    <section
      className={styles.card}
      data-state={ownerSaved ? "completed" : part.state}
      aria-label={part.label}
    >
      <header className={styles.cardHeader}>
        <h2>{interaction?.request.prompt ?? part.label}</h2>
        <span className={styles.status}>
          {ownerSaved
            ? "Saved"
            : approving
              ? "Approving"
              : (CHANGE_STATUS[part.state] ?? part.state)}
        </span>
      </header>
      {order && sortable && (
        <ProductOrder
          ids={arranged ?? order.product_ids}
          products={preview.products}
          onReorder={setArranged}
        />
      )}
      {part.state !== "streaming" && part.input !== undefined && (
        <details className={styles.preview} open={pending || undefined}>
          <summary>Preview</summary>
          <ChangePreview
            tool={part.name}
            input={shownInput}
            data={preview}
            photoOrder={
              carousel && !approving
                ? { order: photoOrder, onOrder: setPhotoOrder }
                : undefined
            }
          />
        </details>
      )}
      {part.state === "failed" && part.error && (
        <p className={styles.error}>{part.error.message}</p>
      )}
      {saveError && (
        <p className={styles.error} role="alert">
          {saveError}
        </p>
      )}
      {pending && interaction && !approving && (
        <div className={styles.actions}>
          {changed ? (
            <div className={styles.options}>
              <button
                type="button"
                className={styles.primary}
                disabled={saving || agent.status === "resuming"}
                onClick={saveArranged}
              >
                {saving ? "Saving…" : "Save this order"}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={saving}
                onClick={() => setArranged(null)}
              >
                Reset
              </button>
            </div>
          ) : arrangedPhotos ? (
            <div className={styles.options}>
              <button
                type="button"
                className={styles.primary}
                disabled={sendingOrder || agent.status === "resuming"}
                onClick={() => void approveArranged()}
              >
                {sendingOrder ? "Approving…" : "Approve in this order"}
              </button>
              <button
                type="button"
                className={styles.secondary}
                disabled={sendingOrder}
                onClick={() => setPhotoOrder(null)}
              >
                Reset
              </button>
            </div>
          ) : (
            <Options interaction={interaction} agent={agent} />
          )}
          {previewToolName(part.name) === "save_news_post" && (
            <SchedulePicker
              current={newsPublishAt(part.input)}
              disabled={agent.status === "resuming"}
              onSchedule={(local) =>
                void agent.send(
                  `Schedule this post to go live ${formatStoreDateTime(local)} store time: status published, published_at "${local}". Keep everything else.`
                )
              }
            />
          )}
          {previewToolName(part.name) === "save_instagram_post" && (
            <SchedulePicker
              current={instagramWhen(part.input)}
              disabled={sendingOrder || agent.status === "resuming"}
              maxDays={INSTAGRAM_SCHEDULE_DAYS}
              onSchedule={(local) =>
                void agent.send(
                  `Schedule this Instagram post for ${formatStoreDateTime(local)} store time: when "${local}". Keep everything else.${photoOrderLine}`
                )
              }
            />
          )}
        </div>
      )}
      {pending && (
        <p className={styles.hint}>
          {approving
            ? "Approved with the photos in your order."
            : order && sortable
              ? "Drag to rearrange, or type what to change."
              : carousel
                ? "Drag the photos to reorder, or type what to change."
                : "Or type what to change."}
        </p>
      )}
      {pageUrl && (
        <a
          className={styles.link}
          href={pageUrl}
          target="_blank"
          rel="noreferrer"
        >
          {INSTAGRAM_LINK.test(pageUrl)
            ? "View on Instagram"
            : "View on the site"}
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
      <section className={`${styles.card} ${styles.question}`}>
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
    <section className={`${styles.card} ${styles.question}`}>
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
  name: string
  size: number
  /** Upload progress, 0 to 1. */
  progress: number
  status: "uploading" | "ready" | "failed"
  path?: string
  width?: number
  height?: number
}

const MAX_MB = Math.round(PHOTO_MAX_BYTES / 1e6)

function Composer({
  agent,
  active,
  voiceReset,
  disabled,
  busy,
  text,
  onText: setText,
  field,
}: {
  agent: Agent
  active: boolean
  voiceReset: number
  disabled: boolean
  busy: boolean
  text: string
  onText: Dispatch<SetStateAction<string>>
  field: RefObject<HTMLTextAreaElement | null>
}) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const previews = useRef(new Set<string>())
  /** Uploads still on the wire, by photo id, so removing one can stop it. */
  const uploads = useRef(new Map<string, AbortController>())
  /** Where each finished upload landed, by photo id. */
  const landed = useRef(new Map<string, string>())
  const anchor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const voice = useVoiceInput(active && !disabled, voiceReset)
  const dictating = voice.phase !== "idle"
  const wasDictating = useRef(false)
  useEffect(() => {
    if (wasDictating.current && !dictating && active && !disabled)
      field.current?.focus()
    wasDictating.current = dictating
  }, [dictating, active, disabled, field])
  const voiceLabel =
    voice.phase === "recording"
      ? "Stop recording"
      : dictating
        ? "Cancel voice input"
        : "Record a message"

  useEffect(() => {
    const urls = previews.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  /** Closes the photo popover; Escape and its buttons hand focus back. */
  const closePanel = (refocus: boolean) => {
    setPanelOpen(false)
    if (refocus) trigger.current?.focus()
  }

  // While open: focus goes to "browse files", and a press anywhere outside
  // the button and the popover closes it, leaving focus where it lands.
  useEffect(() => {
    if (!panelOpen) return
    panel.current?.querySelector<HTMLElement>(".upl-browse")?.focus()
    const onPointerDown = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node)) setPanelOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [panelOpen])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 4000)
    return () => clearTimeout(timer)
  }, [notice])

  const update = (id: string, change: Partial<Photo>) =>
    setPhotos((current) =>
      current.map((photo) =>
        photo.id === id ? { ...photo, ...change } : photo
      )
    )

  /** Starts uploading checked images; each reports its progress. */
  const upload = (files: File[]) => {
    for (const file of files) {
      const id = crypto.randomUUID()
      const preview = URL.createObjectURL(file)
      previews.current.add(preview)
      const controller = new AbortController()
      uploads.current.set(id, controller)
      setPhotos((current) => [
        ...current,
        {
          id,
          preview,
          name: file.name || "Pasted photo",
          size: file.size,
          progress: 0,
          status: "uploading",
        },
      ])
      uploadPhoto(file, {
        onProgress: (progress) => update(id, { progress }),
        signal: controller.signal,
      })
        .then(
          (uploaded) => {
            // Removed while its last bytes were landing: take it back too.
            if (controller.signal.aborted) return discard(uploaded.path)
            landed.current.set(id, uploaded.path)
            update(id, { ...uploaded, status: "ready" })
          },
          () => {
            if (!controller.signal.aborted) update(id, { status: "failed" })
          }
        )
        .finally(() => uploads.current.delete(id))
    }
  }

  /** Deletes a staged upload the owner took back, saying so if it fails. */
  const discard = (path: string) =>
    discardUpload(path).catch(() =>
      setNotice(
        "The photo was removed here but couldn’t be deleted from storage."
      )
    )

  // Pasted and dropped-on-the-composer files get the dropzone's checks.
  const addFiles = (list: Iterable<File>) => {
    const files = [...list]
    const images = files.filter((file) => file.type.startsWith("image/"))
    const fit = images.filter((file) => file.size <= PHOTO_MAX_BYTES)
    if (fit.length < files.length) {
      setNotice(
        images.length < files.length
          ? "Only images can be added."
          : `Photos over ${MAX_MB} MB were left out.`
      )
    }
    upload(fit)
  }

  // Taking a photo back deletes its upload: a finished one from storage, and
  // one still on the wire is stopped (uploadPhoto cleans up after it).
  const removePhoto = (photo: Photo) => {
    URL.revokeObjectURL(photo.preview)
    previews.current.delete(photo.preview)
    setPhotos((current) => current.filter((item) => item.id !== photo.id))
    uploads.current.get(photo.id)?.abort()
    // The path is read from the ref too: the chip can still show
    // "uploading" for a frame after the upload has landed.
    const path = photo.path ?? landed.current.get(photo.id)
    landed.current.delete(photo.id)
    if (path) void discard(path)
  }

  const uploading = photos.some((photo) => photo.status === "uploading")
  const ready = photos.filter((photo) => photo.status === "ready")

  const submit = async () => {
    const lines = ready.map(
      (photo) =>
        `Photo uploaded: ${photo.path} (${photo.width}×${photo.height})`
    )
    const message = [text.trim(), ...lines].filter(Boolean).join("\n")
    if (!message || disabled || uploading || dictating) return
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
    // Sent photos belong to the conversation now; they're never discarded.
    landed.current.clear()
    setPhotos([])
    setText("")
    setPanelOpen(false)
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && dictating) {
          event.preventDefault()
          voice.cancel()
        }
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
                  ? `${Math.round(photo.progress * 100)}%`
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
      {notice && (
        <p className={styles.hint} role="status">
          {notice}
        </p>
      )}
      {voice.error && (
        <p className={styles.hint} role="alert">
          {voice.error}
        </p>
      )}
      <span className="visually-hidden" role="status">
        {voice.phase === "requesting"
          ? "Waiting for microphone permission."
          : voice.phase === "recording"
            ? "Recording. Press Stop recording to transcribe, or Escape to cancel."
            : voice.phase === "transcribing"
              ? "Transcribing to English."
              : ""}
      </span>

      <div className={styles.inputRow}>
        {/* The photo button with its popover, which grows out of the
            button's bubble and points back at it. */}
        <div ref={anchor} className={styles.photoAnchor}>
          <button
            ref={trigger}
            type="button"
            className={styles.iconButton}
            aria-label="Add photos"
            aria-expanded={panelOpen}
            aria-controls="add-photos"
            onClick={() => (panelOpen ? closePanel(true) : setPanelOpen(true))}
          >
            <ImagePlus size={20} strokeWidth={1.6} aria-hidden="true" />
          </button>
          <AnimatePresence>
            {panelOpen && (
              <motion.div
                ref={panel}
                id="add-photos"
                className={styles.photoPopover}
                role="dialog"
                aria-labelledby="add-photos-title"
                initial={{ opacity: 0, scale: 0.9, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.94, y: 6 }}
                transition={{ type: "spring", stiffness: 520, damping: 36 }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.stopPropagation()
                    closePanel(true)
                  }
                }}
              >
                <div className={styles.morphHeader}>
                  <h3 id="add-photos-title">Add photos</h3>
                  <button
                    type="button"
                    className={styles.iconButton}
                    aria-label="Close photos"
                    onClick={() => closePanel(true)}
                  >
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
                <UploadDropzone
                  maxBytes={PHOTO_MAX_BYTES}
                  onFiles={upload}
                  uploads={photos.map((photo) => ({
                    id: photo.id,
                    name: photo.name,
                    size: photo.size,
                    progress: photo.progress,
                    status: photo.status === "ready" ? "done" : photo.status,
                  }))}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <label className="visually-hidden" htmlFor="admin-message">
          Message
        </label>
        <div className={styles.messageField} aria-busy={dictating}>
          <textarea
            ref={field}
            id="admin-message"
            rows={1}
            value={text}
            placeholder={dictating ? "" : "Ask for a change…"}
            hidden={dictating}
            readOnly={dictating}
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
          {voice.phase !== "idle" && (
            <VoiceWaveform
              stream={voice.stream}
              phase={voice.phase}
              seconds={voice.seconds}
            />
          )}
        </div>
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
          type="button"
          className={`${styles.iconButton} ${styles.microphone}`}
          aria-label={voiceLabel}
          title={voiceLabel}
          data-recording={voice.phase === "recording" || undefined}
          disabled={disabled || !active}
          onClick={() => {
            if (voice.phase === "recording") voice.stop()
            else if (dictating) voice.cancel()
            else {
              closePanel(false)
              void voice.start((transcript) => {
                setText((current) =>
                  current.trimEnd()
                    ? `${current.trimEnd()} ${transcript}`
                    : transcript
                )
              })
            }
          }}
        >
          {voice.phase === "recording" ? (
            <Square size={16} fill="currentColor" aria-hidden="true" />
          ) : dictating ? (
            <X size={19} aria-hidden="true" />
          ) : (
            <Mic size={20} strokeWidth={1.6} aria-hidden="true" />
          )}
        </button>
        <ChromaticButton
          type="submit"
          className={styles.send}
          aria-label="Send"
          color="#b126ff"
          colorMode="spectrum"
          speed={0.7}
          paused={false}
          phase={0}
          feather={100}
          projectionScale={174.7}
          intensity={0.9}
          grain={0.105}
          seed={7}
          borderRadius={50}
          hoverEffect="brighten"
          entrance="blur-up"
          entranceSpeed={1}
          entranceBlur={10}
          entranceDistance={20}
          entranceScale={0.65}
          disabled={
            disabled ||
            uploading ||
            dictating ||
            (!text.trim() && ready.length === 0)
          }
        >
          <ArrowUp size={20} aria-hidden="true" />
        </ChromaticButton>
      </div>
    </form>
  )
}
