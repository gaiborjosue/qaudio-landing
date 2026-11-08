"use client"

import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useLayoutEffect,
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
import { ArrowUp, ImagePlus, Mic, Pencil, Plus, Square, X } from "lucide-react"
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
import { idle, turn, type SessionView } from "eve/events"
import { refreshSiteContent, saveArrangedOrder } from "@/app/admin/actions"
import { cleanupLocalChatHistory } from "@/app/admin/chat-actions"
import { ApprovalActions } from "@/components/admin/approval-actions"
import {
  ChangePreview,
  SAVE_TOOLS,
  type PreviewData,
} from "@/components/admin/change-preview"
import type { ChatActions } from "@/components/admin/chat-actions"
import { DatesPrompt } from "@/components/admin/dates-prompt"
import { FlowStepper } from "@/components/admin/flow-stepper"
import { useFlowSettings } from "@/components/admin/flows-menu"
import {
  CopyAction,
  MessageAction,
  ModelInfoAction,
} from "@/components/admin/message-actions"
import { orderScope, ProductOrder } from "@/components/admin/product-order"
import type { ProductRequest } from "@/components/admin/products-view"
import {
  PHOTOS_LIFT,
  QuickActionsMore,
  QuickActionsRow,
  type Ask,
  type QuickMenusProps,
} from "@/components/admin/quick-menus"
import { Steps } from "@/components/admin/steps"
import { TaskQueue } from "@/components/admin/task-queue"
import { isStoryTool, StoryDesigns } from "@/components/admin/story-designs"
import { storyVersions, type StoryVersions } from "@/lib/admin/story-versions"
import { useVoiceInput, VoiceWaveform } from "@/components/admin/voice-input"
import { ChromaticButton } from "@/components/chromatic-button"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { HaloButton } from "@/components/ui/halo-button"
import { Message, MessageContent, MessageFooter } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
} from "@/components/ui/message-scroller"
import { TooltipProvider } from "@/components/ui/tooltip"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import {
  discardUpload,
  PHOTO_MAX_BYTES,
  uploadPhoto,
  type UploadedPhoto,
} from "@/lib/admin/photo-upload"
import {
  instagramPostInputSchema,
  reorderProductsInputSchema,
} from "@/lib/admin/schemas"
import {
  APPROVED_AS,
  APPROVED_PHOTO_ORDER,
  approvedProposals,
  PHOTO_ORDER,
  proposedRelease,
  scheduledAt,
} from "@/lib/admin/approval-choice"
import {
  cardHeading,
  visitableUrl,
  type CardPhase,
  type ChosenRelease,
} from "@/lib/admin/card-heading"
import { toStoreDateTime } from "@/lib/admin/store-time"
import { sentPhotos } from "@/lib/admin/chat-photos"
import { enabledFlows, FLOW_TOOL, flowState } from "@/lib/admin/flows"
import { PLAN_TOOL, taskPlanState } from "@/lib/admin/task-plan"
import { photoLine } from "@/lib/admin/photo-lines"
import { mediaUrl } from "@/lib/media"
import { mediaSessionEvent } from "@/lib/admin/media-lifecycle"
import { responseUsage } from "@/lib/admin/response-usage"
import { ChatSession } from "@/lib/admin/chat-session"
import { newsChatMessage, type NewsChatStart } from "@/lib/admin/news"
import { ChatCacheRefresh } from "@/lib/admin/site-cache"
import { browserSupabase } from "@/lib/supabase/browser"
import styles from "./admin.module.css"

type Agent = UseEveAgentReturn

function requestLocalHistoryCleanup(
  input: {
    currentSessionId?: string
    endedSessionId?: string
  } = {}
) {
  if (process.env.NODE_ENV !== "development") return
  void cleanupLocalChatHistory(input).catch(() => {
    console.warn("Couldn't request local chat history cleanup.")
  })
}

// Shown at the top of every chat, as if the assistant opened it. The owner is
// the only admin; the agent's instructions know not to greet a second time.
const WELCOME =
  "Hello Dariusz! This is Tune, your Q-Audio assistant. I can help you with anything in your website or even post on Instagram, just ask me!"

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
  onNewsChatReady,
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
  onNewsChatReady: (start: NewsChatStart | null) => void
}) {
  const router = useRouter()
  const [, startRefresh] = useTransition()
  const chatSession = useRef(new ChatSession(sessionId))
  const lastHistorySession = useRef(sessionId)
  const cacheRefresh = useRef(new ChatCacheRefresh())
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [ending, setEnding] = useState(false)
  const [voiceReset, setVoiceReset] = useState(0)
  const newsSending = useRef(false)
  const [startingNews, setStartingNews] = useState(false)
  const mediaDraft = useRef<string>("")
  // Created on interaction, so hydration never invents a different draft id.
  const mediaDraftId = useCallback(
    () => (mediaDraft.current ||= crypto.randomUUID()),
    []
  )
  const [flows, setFlow] = useFlowSettings()

  const refreshSavedContent = useCallback(() => {
    startRefresh(async () => {
      try {
        if (await cacheRefresh.current.flush(refreshSiteContent))
          router.refresh()
      } catch {
        setSessionError("Saved changes. Reload this chat to refresh the site.")
      }
    })
  }, [cacheRefresh, router])

  const agent = useEveAgent({
    auth: { bearer: accessToken },
    ...(sessionId && {
      initialSession: { sessionId, streamIndex: 0 },
      resume: true,
    }),
    // One person works in this chat, so nothing starts work here but this
    // page: the stream stays open only while the agent works, and every
    // send or answer opens it again. A chat left waiting for an approval,
    // or idle while the owner is in another tab, holds no connection.
    followWhile: (view) => !idle(view),
    // Every message says which flows are on; the eve channel tells the
    // model and checks them (lib/admin/flows.ts). Answers keep their turn's.
    prepareSend: (input) =>
      input.message !== undefined
        ? {
            ...input,
            clientContext: {
              flows: enabledFlows(flows),
              mediaSession: mediaDraftId(),
            },
          }
        : input,
    onSessionChange(session) {
      chatSession.current.sessionId = session?.sessionId
      if (session) {
        onSession(session.sessionId)
        if (lastHistorySession.current !== session.sessionId) {
          lastHistorySession.current = session.sessionId
          requestLocalHistoryCleanup({ currentSessionId: session.sessionId })
        }
      }
    },
    // Tools notify Next directly. The browser refreshes its previews and can
    // repair a missed notification, including when reading recorded events.
    onEvent(event) {
      cacheRefresh.current.observe(event)
    },
    onFinish: refreshSavedContent,
  })

  const busy = agent.status === "busy"
  const resuming = agent.status === "resuming"
  const { send: sendMessage, respond: sendAnswer, cancel } = agent
  const send = useCallback<Agent["send"]>(
    (message, options) =>
      chatSession.current.request(
        () => sendMessage(message, options),
        voiceReset
      ),
    [chatSession, sendMessage, voiceReset]
  )
  const respond = useCallback<Agent["respond"]>(
    (answers, options) =>
      chatSession.current.request(
        () => sendAnswer(answers, options),
        voiceReset
      ),
    [chatSession, sendAnswer, voiceReset]
  )
  useEffect(() => {
    const session = chatSession.current
    return () => session.disconnect()
  }, [])
  // Catch-up doesn't fire onFinish. Its completed calls still need a refresh.
  useEffect(() => {
    if (!resuming) refreshSavedContent()
  }, [resuming, refreshSavedContent])
  // Stable while the reply streams, so finished turns don't re-render.
  const actions = useMemo<ChatActions>(
    () => ({ send, respond, resuming: resuming || ending }),
    [send, respond, resuming, ending]
  )

  // Chats are disposable: long-term memory keeps what matters, so New chat
  // ends the server session instead of leaving it behind.
  const newChat = async () => {
    if (chatSession.current.ending) return
    setEnding(true)
    setSessionError(null)
    try {
      await chatSession.current.retire(agent.end, (id) => {
        requestLocalHistoryCleanup(id ? { endedSessionId: id } : {})
        if (mediaDraft.current) {
          // Auxiliary cleanup mustn't hold the retired chat open. Its server
          // hook and database fallback also cover a disconnected browser.
          void mediaSessionEvent(
            browserSupabase(),
            mediaDraft.current,
            id ?? null,
            "ended"
          ).catch(() => {})
        }
        agent.newSession()
        mediaDraft.current = ""
        setDraft("")
        setVoiceReset(chatSession.current.version)
        onSession(undefined)
      })
    } catch {
      setSessionError("Couldn’t end this chat. Try New chat again.")
    } finally {
      setEnding(false)
    }
  }

  // Quick actions send the owner's opening line, as if typed, and the agent
  // takes it from there. An Edit choice adds a hidden "Item:" line naming the
  // exact item (the bubble drops it, like "Photo uploaded:").
  const ask = useCallback<Ask>(
    (text, item) => void send(item ? `${text}\nItem: ${item}` : text),
    [send]
  )

  // The composer's text lives here so a sent message's Edit can put its
  // words back in the field.
  const [draft, setDraft] = useState("")
  const field = useRef<HTMLTextAreaElement>(null)
  const startNewsChat = useCallback<NewsChatStart>(
    (post) => {
      if (newsSending.current) return
      newsSending.current = true
      setStartingNews(true)
      setSessionError(null)
      void send(newsChatMessage(post))
        .then(() => field.current?.focus())
        .catch(() => {
          setSessionError(
            "Couldn’t start this news conversation. Try again from News."
          )
        })
        .finally(() => {
          newsSending.current = false
          setStartingNews(false)
        })
    },
    [send]
  )
  useEffect(() => {
    onNewsChatReady(
      busy || resuming || ending || startingNews ? null : startNewsChat
    )
    return () => onNewsChatReady(null)
  }, [busy, resuming, ending, startingNews, startNewsChat, onNewsChatReady])
  const edit = useCallback((text: string) => {
    setDraft(text)
    field.current?.focus()
  }, [])

  // Read again only when the conversation changes, not as the owner types;
  // the stepper redraws only when the run's steps change.
  const run = useMemo(() => flowState(agent.messages), [agent.messages])
  const plan = useMemo(() => taskPlanState(agent.messages), [agent.messages])

  // What the quick actions need, kept as one object that changes only when
  // they do, so the composer doesn't redraw with every streamed update.
  const disabled = resuming || ending || startingNews
  const quick = useMemo<QuickMenusProps>(
    () => ({ preview, ask, onProduct, flows, onFlow: setFlow, disabled }),
    [preview, ask, onProduct, flows, setFlow, disabled]
  )

  return (
    // Morphs and other Motion animations go instant under reduced motion.
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        {actionsTarget &&
          createPortal(
            <HaloButton
              type="button"
              buttonClassName={styles.newChat}
              leadingIcon={<Plus size={15} aria-hidden="true" />}
              isLoading={ending}
              loadingText="Starting…"
              disabled={ending || resuming || startingNews}
              onClick={newChat}
            >
              New chat
            </HaloButton>,
            actionsTarget
          )}
        <div className={styles.workspace}>
          {/* Above the thread, or in the space left of it on wide screens. */}
          {plan ? (
            <TaskQueue key={plan.id} plan={plan} busy={busy} />
          ) : (
            <FlowStepper run={run} />
          )}
          <div className={styles.chat}>
            <Conversation
              active={active}
              messages={agent.messages}
              view={agent.view}
              actions={actions}
              preview={preview}
              busy={busy}
              onEdit={edit}
            />

            {(sessionError || agent.error) && (
              <p className={styles.error} role="alert">
                {sessionError ?? agent.error?.message}
              </p>
            )}

            {/* The quick actions, then the message field: the Composer
                draws both, since the actions fold into the field's own
                button while it holds a message. */}
            <Composer
              key={voiceReset}
              send={send}
              cancel={cancel}
              active={active}
              voiceReset={voiceReset}
              disabled={disabled}
              busy={busy}
              text={draft}
              onText={setDraft}
              field={field}
              quick={quick}
              mediaDraftId={mediaDraftId}
              eveSessionId={agent.session?.sessionId}
            />
          </div>
        </div>
      </TooltipProvider>
    </MotionConfig>
  )
}

/**
 * The thread. Memoized: typing in the composer doesn't redraw it, and while
 * a reply streams only that reply's message does (eve keeps the other
 * messages' objects, and MessageView compares what each one shows).
 */
const Conversation = memo(function Conversation({
  active,
  messages,
  view,
  actions,
  preview,
  busy,
  onEdit,
}: {
  active: boolean
  messages: readonly EveMessage[]
  view: SessionView
  actions: ChatActions
  preview: PreviewData
  busy: boolean
  onEdit: (text: string) => void
}) {
  const viewport = useRef<HTMLDivElement>(null)
  const lastRow = useRef<HTMLDivElement>(null)
  const ownerSaved = ownerSavedOrders(messages)
  const choices = approvedProposals(messages)
  const stories = storyVersions(
    messages.flatMap((message) =>
      message.parts.filter(
        (part): part is EveToolPart =>
          part.type === "tool" && isStoryTool(part.name)
      )
    )
  )
  // Steering can split a turn into several messages. Only its last reply
  // gets actions, and only after the turn itself has settled.
  const finalReplies = new Map<string, string>()
  for (const message of messages) {
    if (message.role === "assistant")
      finalReplies.set(message.metadata?.turnId ?? message.id, message.id)
  }
  // Usage is read only on hover/focus. Keep the callback stable so old
  // replies don't redraw, or scan every model/content row, as tokens arrive.
  const usageSource = useRef({ messages, view })
  useLayoutEffect(() => {
    usageSource.current = { messages, view }
  }, [messages, view])
  const getUsage = useCallback((id: string) => {
    const source = usageSource.current
    return responseUsage(id, source.messages, source.view)
  }, [])
  return (
    // Each of the owner's messages anchors its turn near the top, the reply
    // streams in below it and is followed while the reader stays at the
    // live edge, and a reopened chat opens at its last turn.
    <MessageScrollerProvider autoScroll defaultScrollPosition="last-anchor">
      <MessageScroller>
        <MessageScrollerViewport ref={viewport} aria-label="Conversation">
          <MessageScrollerContent className={styles.log} aria-busy={busy}>
            <MessageScrollerItem>
              <Message className={styles.message}>
                <MessageContent className={styles.reply}>
                  <p>{WELCOME}</p>
                </MessageContent>
              </Message>
            </MessageScrollerItem>
            {messages.map((message, index) => {
              const cards = cardStates(message, ownerSaved, choices)
              const versions = Object.fromEntries(
                message.parts.flatMap((part) =>
                  part.type === "tool" && stories[part.callId]
                    ? [[part.callId, stories[part.callId]]]
                    : []
                )
              )
              return (
                <MessageScrollerItem
                  key={message.id}
                  ref={index === messages.length - 1 ? lastRow : undefined}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <MessageView
                    message={message}
                    actions={actions}
                    preview={preview}
                    cards={cards}
                    cardsKey={JSON.stringify(cards)}
                    versions={versions}
                    versionsKey={JSON.stringify(versions)}
                    getUsage={getUsage}
                    finished={
                      !actions.resuming &&
                      message.metadata?.status === "complete" &&
                      finalReplies.get(
                        message.metadata.turnId ?? message.id
                      ) === message.id &&
                      (!message.metadata.turnId ||
                        turn(view, message.metadata.turnId)?.status ===
                          "settled")
                    }
                    onEdit={onEdit}
                  />
                </MessageScrollerItem>
              )
            })}
            {busy && (
              <MessageScrollerItem>
                <p className={styles.working} role="status">
                  Working…
                </p>
              </MessageScrollerItem>
            )}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <ReleaseScrollSpace
          pending={busy || actions.resuming || !active}
          viewport={viewport}
          lastRow={lastRow}
        />
        <MessageScrollerButton className="motion-reduce:transition-none" />
      </MessageScroller>
    </MessageScrollerProvider>
  )
})

/** Release the turn's reserved space once idle, without pulling scrollback. */
function ReleaseScrollSpace({
  pending,
  viewport,
  lastRow,
}: {
  pending: boolean
  viewport: RefObject<HTMLDivElement | null>
  lastRow: RefObject<HTMLDivElement | null>
}) {
  const { scrollToEnd } = useMessageScroller()
  // This reports the real transcript end, excluding the anchor spacer.
  const { end: moreBelow } = useMessageScrollerScrollable()
  useLayoutEffect(() => {
    if (pending || moreBelow) return
    const frame = viewport.current
    const row = lastRow.current
    if (!frame?.clientHeight || !frame.clientWidth || !row) return
    // A hidden tab can leave the scroller's snapshot stale. Recheck the
    // visible tail before releasing its anchor, with no document queries.
    if (
      row.getBoundingClientRect().bottom <= frame.getBoundingClientRect().bottom
    )
      scrollToEnd()
  }, [pending, moreBelow, scrollToEnd, viewport, lastRow])
  return null
}

/** What a change card shows besides its call: decided by later messages. */
type CardState = {
  /** The order the owner arranged on a reorder card and saved. */
  ownerSaved?: string[]
  /** Approved with a choice on the card before it, which it matches. */
  preapproved?: true
  /** Withdrawn by a choice on it, and proposed again with that choice:
   * the new card stands for it, so it's no longer shown. */
  replaced?: true
  /** The owner's choice on it, while the agent proposes it that way. */
  chosen?: ChosenRelease
}

/** The states of a message's change cards, by call id. */
function cardStates(
  message: EveMessage,
  ownerSaved: Map<string, string[]>,
  choices: ReturnType<typeof approvedProposals>
) {
  const cards: Record<string, CardState> = {}
  for (const part of message.parts) {
    if (part.type !== "tool" || !SAVE_TOOLS.has(part.name)) continue
    const saved = ownerSaved.get(part.callId)
    const choice = choices.chosen.get(part.callId)
    const release =
      choice &&
      proposedRelease(choice.tool, choice.post, toStoreDateTime(new Date()))
    const state: CardState = {
      ...(saved && { ownerSaved: saved }),
      ...(choices.approved.has(part.callId) && { preapproved: true }),
      ...(choices.replaced.has(part.callId) && { replaced: true }),
      ...(choice &&
        release && {
          chosen: { release, at: scheduledAt(choice.tool, choice.post) },
        }),
    }
    if (Object.keys(state).length > 0) cards[part.callId] = state
  }
  return cards
}

// Lines meant for the agent, not the bubble: uploaded photos, the item an
// Edit-menu choice names, a product order the owner arranged and saved on a
// reorder card ("Order:" is the earlier form), and what the owner approved
// on a card ("Approved as:", lib/admin/approval-choice.ts; older chats carry
// a carousel's photo order). Older chats also carry what the owner saved or
// asked to draft in the chat's former product editor and table.
const HIDDEN_LINE = new RegExp(
  `^(Photo uploaded|Item|Order|Order saved|Product saved|Products updated|Editor|Story edit|${PHOTO_ORDER}|${APPROVED_PHOTO_ORDER}|${APPROVED_AS}): .*$`,
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

/** A working step: a call that's neither a change card, the story designs,
 * nor an open question. Older chats' product editor and table calls read
 * as steps too. */
const isStep = (part: ReplyPart): part is EveToolPart =>
  part.type === "tool" &&
  !SAVE_TOOLS.has(part.name) &&
  !isStoryTool(part.name) &&
  part.interaction?.status !== "open"

/**
 * A reply's parts in order, with each run of working steps gathered into
 * one. Parts that draw nothing (control calls, a flow's progress calls,
 * which the stepper shows, reasoning, files) are left out, so they don't
 * split a run.
 */
function replyRuns(parts: readonly ReplyPart[]) {
  const runs: (
    | { part: ReplyPart; index: number; steps?: undefined }
    | { part?: undefined; index?: undefined; steps: EveToolPart[] }
  )[] = []
  parts.forEach((part, index) => {
    if (part.type === "tool" && part.kind === "control") return
    if (part.type === "tool" && part.name === FLOW_TOOL) return
    if (
      part.type === "tool" &&
      part.name === PLAN_TOOL &&
      part.state !== "failed" &&
      part.state !== "rejected" &&
      part.state !== "cancelled"
    )
      return
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

type MessageViewProps = {
  message: EveMessage
  actions: ChatActions
  preview: PreviewData
  cards: Record<string, CardState>
  /** `cards` as text, so a redraw can be skipped when they're the same. */
  cardsKey: string
  /** Its story designs' versions, by call. */
  versions: Record<string, StoryVersions>
  versionsKey: string
  getUsage: (id: string) => ReturnType<typeof responseUsage>
  finished: boolean
  onEdit: (text: string) => void
}

/**
 * The same message with the same card states draws the same. The owner's
 * own messages come back as new objects on every update, so those compare
 * by what they say.
 */
function sameMessage(a: MessageViewProps, b: MessageViewProps) {
  return (
    (a.message === b.message ||
      (a.message.role === "user" &&
        a.message.id === b.message.id &&
        a.message.metadata?.status === b.message.metadata?.status &&
        JSON.stringify(a.message.parts) === JSON.stringify(b.message.parts))) &&
    a.actions === b.actions &&
    a.preview === b.preview &&
    a.cardsKey === b.cardsKey &&
    a.versionsKey === b.versionsKey &&
    a.getUsage === b.getUsage &&
    a.finished === b.finished &&
    a.onEdit === b.onEdit
  )
}

const MessageView = memo(function MessageView({
  message,
  actions,
  preview,
  cards,
  versions,
  getUsage,
  finished,
  onEdit,
}: MessageViewProps) {
  const text = messageText(message)

  if (message.role === "user") {
    const photos = sentPhotos(message)
    return (
      <Message align="end" className={styles.message}>
        <MessageContent>
          {photos.length > 0 && (
            <div className={styles.sentPhotos}>
              {photos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element -- uploaded photo of unknown size
                <img
                  key={url}
                  className={styles.sentPhoto}
                  crossOrigin={
                    url.startsWith(mediaUrl("")) ? "anonymous" : undefined
                  }
                  src={url}
                  alt=""
                />
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

  // A completed text part may be followed by more tools or an approval.
  // Actions wait for the whole turn, not just a pause in text streaming.
  const writing = message.parts.some(
    (part) => part.type === "text" && part.state === "streaming"
  )

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
                const card = cards[part.callId]
                // The card the owner's choice replaced: the new one stands
                // for it.
                if (card?.replaced) return null
                return (
                  <ChangeCard
                    key={key}
                    part={part}
                    actions={actions}
                    preview={preview}
                    ownerSaved={card?.ownerSaved}
                    preapproved={card?.preapproved}
                    chosen={card?.chosen}
                  />
                )
              }
              // The story design: a placeholder while it's made, then the
              // design. (Older chats asked to pick one of two.)
              if (isStoryTool(part.name)) {
                return (
                  <Fragment key={key}>
                    <StoryDesigns
                      part={part}
                      actions={actions}
                      versions={versions[part.callId]}
                    />
                    {part.interaction?.status === "open" &&
                      !(
                        part.output &&
                        typeof part.output === "object" &&
                        "review" in part.output
                      ) && (
                        <Prompt
                          interaction={part.interaction}
                          actions={actions}
                        />
                      )}
                  </Fragment>
                )
              }
              // Not a step, so it's a question still waiting for an answer;
              // ask_dates asks with a calendar.
              if (part.name === "ask_dates" && part.interaction) {
                return part.interaction.status === "open" &&
                  part.interaction.answer === undefined ? (
                  <DatesPrompt
                    key={key}
                    interaction={part.interaction}
                    input={part.input}
                    actions={actions}
                  />
                ) : null
              }
              return part.interaction ? (
                <Prompt
                  key={key}
                  interaction={part.interaction}
                  actions={actions}
                />
              ) : null
            case "interaction":
              return <Prompt key={key} interaction={part} actions={actions} />
            default:
              return null
          }
        })}
        {text && finished && !writing && (
          <MessageFooter className={styles.replyFooter}>
            <CopyAction text={text} />
            <ModelInfoAction messageId={message.id} getUsage={getUsage} />
          </MessageFooter>
        )}
      </MessageContent>
    </Message>
  )
}, sameMessage)

const INSTAGRAM_LINK = /^https:\/\/(www\.)?instagram\.com\//

/** Where a change card stands, from its call and what the owner did. */
function cardPhase(
  part: EveToolPart,
  {
    ownerSaved,
    preapproved,
    chosen,
  }: { ownerSaved?: string[]; preapproved: boolean; chosen?: ChosenRelease }
): CardPhase {
  if (ownerSaved || part.state === "completed") return "done"
  if (part.state === "failed") return "failed"
  // The owner picked another way for it to go out: it's being proposed
  // again that way, and the new card replaces it.
  if (chosen) return "saving"
  if (part.state === "streaming") return "preparing"
  const interaction = part.interaction
  const answer = interaction?.answer
  // An answer counts from the moment it's sent, not when eve settles it.
  if (interaction?.status === "open" && answer === undefined) {
    return preapproved ? "saving" : "asking"
  }
  if (answer?.optionId === "approve" || part.state === "running") {
    return "saving"
  }
  if (answer?.optionId === "deny") return "denied"
  if (part.state === "rejected" || part.state === "cancelled") {
    return "withdrawn"
  }
  return interaction ? "saving" : "preparing"
}

// How the card is drawn in each phase (its outline, and dimmed when it
// didn't go through).
const PHASE_STATE: Record<CardPhase, string> = {
  preparing: "streaming",
  asking: "approval",
  saving: "running",
  done: "completed",
  denied: "rejected",
  withdrawn: "rejected",
  failed: "failed",
}

const ChangeCard = memo(function ChangeCard({
  part,
  actions,
  preview,
  ownerSaved,
  preapproved = false,
  chosen,
}: {
  part: EveToolPart
  actions: ChatActions
  preview: PreviewData
  /** The order the owner arranged on this reorder card and saved. */
  ownerSaved?: string[]
  /** Approved with a choice on the card before it, which this matches. */
  preapproved?: boolean
  /** The owner's choice on it, while the agent proposes it that way. */
  chosen?: ChosenRelease
}) {
  const interaction = part.interaction
  const phase = cardPhase(part, { ownerSaved, preapproved, chosen })
  const pending = phase === "asking"
  // What the owner wrote when denying it, without the lines for the agent.
  const denial =
    phase === "denied"
      ? interaction?.answer?.text?.replace(HIDDEN_LINE, "").trim()
      : undefined
  // Once answered, the heading says what is happening or happened instead
  // of asking (lib/admin/card-heading.ts).
  const heading = cardHeading({
    name: part.name,
    input: part.input,
    output: part.output,
    label: part.label,
    prompt: interaction?.request.prompt,
    phase,
    chosen,
    note: !!denial,
    now: toStoreDateTime(new Date()),
  })
  // A draft or scheduled post has no page to visit yet.
  const pageUrl = part.state === "completed" ? visitableUrl(part.output) : null
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
      await actions.send(
        `I saved ${orderScope(order, preview.taxonomy)} in the order I arranged.\nOrder saved: ${JSON.stringify(input)}`
      )
    })
  }

  // A carousel's photos can be rearranged on its preview. The tool's input
  // can't change once proposed, so approving sends the new order to the
  // agent with the choice of how it goes out, and the agent proposes the
  // same post with it (lib/admin/approval-choice.ts).
  const [photoOrder, setPhotoOrder] = useState<number[] | null>(null)
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

  // Answer, once, a re-proposal that matches what the owner approved.
  const autoApproved = useRef(false)
  const { respond, resuming } = actions
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
    respond([
      { interactionId: interaction.interactionId, optionId: "approve" },
    ]).catch(() => {
      autoApproved.current = false
    })
  }, [preapproved, resuming, interaction, respond])

  const approval =
    interaction?.request.options?.some((option) => option.id === "approve") &&
    interaction.request.options.some((option) => option.id === "deny")
  const hint =
    order && sortable
      ? "Drag to rearrange, or type what to change."
      : carousel
        ? "Drag the photos to reorder, or type what to change."
        : "Or type what to change."

  return (
    <section
      className={styles.card}
      data-state={PHASE_STATE[phase]}
      aria-label={heading.title}
    >
      <header className={styles.cardHeader}>
        <h2>{heading.title}</h2>
        <span className={styles.status} role="status">
          {heading.status}
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
              carousel && pending
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
      {denial && <p className={styles.denialNote}>“{denial}”</p>}
      {pending &&
        interaction &&
        (changed ? (
          <>
            <div className={styles.options}>
              <button
                type="button"
                className={styles.primary}
                disabled={saving || actions.resuming}
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
            <p className={styles.hint}>{hint}</p>
          </>
        ) : approval ? (
          <ApprovalActions
            actions={actions}
            interaction={interaction}
            tool={part.name}
            input={part.input}
            arrangedPhotos={arrangedPhotos}
            onResetPhotos={() => setPhotoOrder(null)}
            hint={hint}
          />
        ) : (
          <>
            <Options interaction={interaction} actions={actions} />
            <p className={styles.hint}>{hint}</p>
          </>
        ))}
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
})

/** An approval or question's choices; the first is the primary action. */
function Options({
  interaction,
  actions,
}: {
  interaction: Interaction
  actions: ChatActions
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
          disabled={sending || answered || actions.resuming}
          title={option.description}
          onClick={async () => {
            setSending(true)
            try {
              await actions.respond([
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
  actions,
}: {
  interaction: Interaction | EveInteractionPart
  actions: ChatActions
}) {
  const { request } = interaction
  // Gone once answered: the reply says what comes of it.
  if (interaction.status !== "open" || interaction.answer !== undefined) {
    return null
  }
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
      <Options interaction={interaction} actions={actions} />
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

const Composer = memo(function Composer({
  send,
  cancel,
  active,
  voiceReset,
  disabled,
  busy,
  text,
  onText: setText,
  field,
  quick,
  mediaDraftId,
  eveSessionId,
}: {
  send: Agent["send"]
  cancel: Agent["cancel"]
  active: boolean
  voiceReset: number
  disabled: boolean
  busy: boolean
  text: string
  onText: Dispatch<SetStateAction<string>>
  field: RefObject<HTMLTextAreaElement | null>
  /** The quick actions: above the field, or folded into its button. */
  quick: QuickMenusProps
  mediaDraftId: () => string
  eveSessionId?: string
}) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [panelOpen, setPanelOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // Send pressed while photos are still uploading: it goes once they land.
  const [queued, setQueued] = useState(false)
  const sending = useRef(false)
  const mounted = useRef(true)
  const previews = useRef(new Set<string>())
  /** Uploads still on the wire, by photo id, so removing one can stop it. */
  const uploads = useRef(new Map<string, AbortController>())
  /** Each upload under way, by photo id, settling when it's done either way. */
  const inFlight = useRef(new Map<string, Promise<void>>())
  /** Where each finished upload landed, by photo id. */
  const landed = useRef(new Map<string, UploadedPhoto>())
  /** Photos whose upload failed, still in the message. */
  const failedIds = useRef(new Set<string>())
  const anchor = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const inputRow = useRef<HTMLDivElement>(null)
  // A message in the field (the same test that enables Send): the quick
  // actions are shortcuts for starting one, so they fold into a button.
  const composing = text.trim() !== "" || photos.length > 0
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
    mounted.current = true
    const urls = previews.current
    return () => {
      mounted.current = false
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

  /**
   * Starts uploading checked images; each reports its progress. A failed
   * upload is tried once more before it shows as failed: most failures are
   * a dropped connection or a token being refreshed.
   */
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
      const attempt = (retries: number): Promise<UploadedPhoto> =>
        uploadPhoto(file, {
          mediaSession: { id: mediaDraftId(), eve: eveSessionId },
          onProgress: (progress) => update(id, { progress }),
          signal: controller.signal,
        }).catch(async (error: unknown) => {
          if (controller.signal.aborted || retries === 0) throw error
          await new Promise((resolve) => window.setTimeout(resolve, 800))
          if (controller.signal.aborted) throw error
          update(id, { progress: 0 })
          return attempt(retries - 1)
        })
      const done = attempt(1)
        .then(
          (uploaded) => {
            // Removed while its last bytes were landing: take it back too.
            if (controller.signal.aborted) return void discard(uploaded.path)
            landed.current.set(id, uploaded)
            update(id, { ...uploaded, status: "ready", progress: 1 })
          },
          () => {
            if (controller.signal.aborted) return
            failedIds.current.add(id)
            update(id, { status: "failed" })
          }
        )
        .finally(() => {
          uploads.current.delete(id)
          inFlight.current.delete(id)
        })
      inFlight.current.set(id, done)
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
    failedIds.current.delete(photo.id)
    // The path is read from the ref too: the chip can still show
    // "uploading" for a frame after the upload has landed.
    const path = photo.path ?? landed.current.get(photo.id)?.path
    landed.current.delete(photo.id)
    if (path) void discard(path)
  }

  const failed = photos.some((photo) => photo.status === "failed")

  /**
   * Sends the words and the photos, each as a `Photo uploaded:` line (the
   * agent looks at them by path; lib/admin/photo-lines.ts). Photos still
   * uploading are waited for, with the field held as it is. What's sent
   * leaves the composer before the request, so a second Enter can't send it
   * twice and anything added meanwhile stays; a failed send puts it back.
   */
  const submit = async () => {
    if (disabled || busy || dictating || sending.current) return
    const typed = text.trim()
    const queuedPhotos = photos
    if (!typed && queuedPhotos.length === 0) return
    if (failed) {
      setNotice("A photo didn’t upload. Remove it, then add it again.")
      return
    }
    sending.current = true
    try {
      const waiting = queuedPhotos.flatMap(
        (photo) => inFlight.current.get(photo.id) ?? []
      )
      if (waiting.length > 0) {
        setQueued(true)
        await Promise.all(waiting)
        setQueued(false)
        if (!mounted.current) return
      }
      if (queuedPhotos.some((photo) => failedIds.current.has(photo.id))) {
        setNotice("A photo didn’t upload. Remove it, then add it again.")
        return
      }
      // Photos the owner took back while waiting have no landing.
      const sent = queuedPhotos.flatMap((photo) => {
        const uploaded = landed.current.get(photo.id)
        return uploaded ? [{ ...photo, ...uploaded }] : []
      })
      if (!typed && sent.length === 0) return
      const message = [typed, ...sent.map(photoLine)].filter(Boolean).join("\n")

      const sentIds = new Set(sent.map((photo) => photo.id))
      for (const id of sentIds) landed.current.delete(id)
      setPhotos((current) => current.filter((photo) => !sentIds.has(photo.id)))
      setText((current) => (current.trim() === typed ? "" : current))
      setPanelOpen(false)
      try {
        await send(message)
      } catch (error) {
        // An upload from the previous chat mustn't send or restore its draft
        // into the new conversation, even before React commits the reset.
        if (
          !mounted.current ||
          (error instanceof DOMException && error.name === "AbortError")
        )
          return
        // Not accepted: put the message back to send again.
        for (const photo of sent) landed.current.set(photo.id, photo)
        setPhotos((current) => [
          ...sent.map((photo) => ({
            ...photo,
            status: "ready" as const,
            progress: 1,
          })),
          ...current,
        ])
        setText((current) => current || typed)
        setNotice("Couldn’t send that. Try again.")
        return
      }
      // Sent photos belong to the conversation now; they're never
      // discarded, and the bubble shows them from storage.
      for (const photo of sent) {
        URL.revokeObjectURL(photo.preview)
        previews.current.delete(photo.preview)
      }
    } finally {
      sending.current = false
    }
  }

  return (
    <>
      <QuickActionsRow
        shown={!composing}
        lift={photos.length > 0 ? PHOTOS_LIFT : 0}
        quick={quick}
      />
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
        {queued && (
          <p className={styles.hint} role="status">
            Sending once the photos finish uploading…
          </p>
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

        <div ref={inputRow} className={styles.inputRow}>
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
              onClick={() =>
                panelOpen ? closePanel(true) : setPanelOpen(true)
              }
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
          {/* The quick actions, folded beside the photo button while the
            field holds a message. */}
          <AnimatePresence initial={false}>
            {composing && (
              <QuickActionsMore
                key="quick-actions"
                quick={quick}
                bounds={inputRow}
              />
            )}
          </AnimatePresence>
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
              // Held as it is while the message waits for its photos.
              readOnly={dictating || queued}
              onChange={(event) => setText(event.target.value)}
              onPaste={(event) => {
                // Screenshots and copied images; some browsers list them only
                // as clipboard items.
                const data = event.clipboardData
                const files =
                  data.files.length > 0
                    ? [...data.files]
                    : [...data.items].flatMap((item) => {
                        const file =
                          item.kind === "file" ? item.getAsFile() : null
                        return file ? [file] : []
                      })
                if (files.some((file) => file.type.startsWith("image/"))) {
                  addFiles(files)
                  if (!data.getData("text")) event.preventDefault()
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
            type={busy ? "button" : "submit"}
            className={styles.send}
            aria-label={busy ? "Stop response" : "Send"}
            title={busy ? "Stop response" : "Send"}
            data-responding={busy || undefined}
            data-active={active || undefined}
            onClick={busy ? () => void cancel() : undefined}
            color="#b126ff"
            colorMode="spectrum"
            speed={0.7}
            paused={busy || !active}
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
              (!busy &&
                (queued || dictating || (!text.trim() && photos.length === 0)))
            }
          >
            {busy ? (
              <>
                <span className={styles.responseVinyl} aria-hidden="true" />
                <Square
                  className={styles.stopSymbol}
                  size={16}
                  fill="currentColor"
                  strokeWidth={0}
                  aria-hidden="true"
                />
              </>
            ) : (
              <ArrowUp size={20} aria-hidden="true" />
            )}
          </ChromaticButton>
        </div>
      </form>
    </>
  )
})
