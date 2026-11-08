import {
  ForbiddenError,
  UnauthenticatedError,
  extractBearerToken,
  localDev,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth"
import { defaultEveAuth, eveChannel } from "eve/channels/eve"
import type { MessageContent } from "eve/client"
import {
  FLOW_ATTRIBUTE,
  FLOW_IDS,
  flowContext,
  flowHint,
  flowsFromClient,
} from "../../lib/admin/flows"
import { photoContext, photoLines } from "../../lib/admin/photo-lines"
import { readStoryEdit } from "../../lib/admin/story-edits"
import { CHAT_GENERATION_ATTRIBUTE } from "../../lib/admin/current-chat"
import {
  MEDIA_SESSION_ATTRIBUTE,
  UUID,
  attachChatImages,
  isPrivateUpload,
  mediaSessionEvent,
} from "../../lib/admin/media-lifecycle"
import {
  STORE_TIME_ZONE,
  WEEKDAYS,
  storeClock,
  weekdayIndex,
} from "../../lib/store-hours"
import {
  ACCESS_TOKEN_ATTRIBUTE,
  supabaseIssuer,
  verifyAdminToken,
  callerSupabase,
} from "../lib/supabase"

// The admin chat (/admin) sends the signed-in admin's Supabase access token as
// a bearer token. Only site admins get in; their token rides on the session's
// caller so tools act as them under RLS.
const supabaseAdmin: AuthFn<Request> = withAuthChallenges(
  async (request) => {
    const token = extractBearerToken(request.headers.get("authorization"))
    if (!token) return null
    const result = await verifyAdminToken(token)
    if (result === "invalid") {
      throw new UnauthenticatedError({
        message: "Sign in again at /admin/login.",
      })
    }
    if (result === "forbidden") {
      throw new ForbiddenError({
        message: "Only Q Audio site admins can use this.",
      })
    }
    return {
      authenticator: "supabase",
      issuer: supabaseIssuer(),
      principalId: result.userId,
      principalType: "user",
      subject: result.userId,
      attributes: { email: result.email, [ACCESS_TOKEN_ATTRIBUTE]: token },
    }
  },
  [{ scheme: "Bearer" }]
)

function storeNow() {
  const { date, minutes } = storeClock(new Date())
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
  return `Store time now: ${WEEKDAYS[weekdayIndex(date)]} ${date} ${time} (${STORE_TIME_ZONE}).`
}

export default eveChannel({
  // localDev() only admits requests while `next dev` runs the agent; tools
  // still need a signed-in admin's token.
  auth: [supabaseAdmin, localDev()],
  // Photos go by path, never as attachments (lib/admin/photo-lines.ts): eve
  // would copy an attachment into the session's sandbox, which would start
  // one for every chat with a photo (and fail where none can start). The
  // model looks at photos with view_photos instead.
  uploadPolicy: "disabled",
  // The chat sends which flows the owner has on ({ flows: [...] }); they
  // ride on the caller for flow_progress to check, and the model reads
  // which are on and when each applies (lib/admin/flows.ts), with a nudge
  // when the message is about a sale. Photos the message attaches get a
  // reminder to look at them.
  onMessage: async (ctx, message) => {
    const auth = defaultEveAuth(ctx)
    const clientContext = ctx.eve.clientContext
    const chatGeneration =
      clientContext &&
      typeof clientContext === "object" &&
      !Array.isArray(clientContext)
        ? (clientContext as Record<string, unknown>).chatGeneration
        : undefined
    const mediaSession =
      clientContext &&
      typeof clientContext === "object" &&
      !Array.isArray(clientContext)
        ? (clientContext as Record<string, unknown>).mediaSession
        : undefined
    const flows = flowsFromClient(ctx.eve.clientContext) ?? [...FLOW_IDS]
    const text = messageText(message)
    const attached = photoLines(text)
    if (
      auth?.principalType === "user" &&
      attached.some((photo) => isPrivateUpload(photo.path))
    ) {
      const client = callerSupabase({ session: { auth: { current: auth } } })
      const session = await mediaSessionEvent(
        client,
        typeof mediaSession === "string" && UUID.test(mediaSession)
          ? mediaSession
          : null,
        ctx.eve.sessionId ?? null,
        "draft"
      )
      await attachChatImages(
        client,
        session,
        attached.map((photo) => photo.path)
      )
    }
    const storyEdit = readStoryEdit(text)
    const hint = storyEdit ? null : flowHint(text, flows)
    const photos = photoContext(attached)
    return {
      auth: auth && {
        ...auth,
        attributes: {
          ...auth.attributes,
          [FLOW_ATTRIBUTE]: flows,
          ...(typeof chatGeneration === "string" &&
            UUID.test(chatGeneration) && {
              [CHAT_GENERATION_ATTRIBUTE]: chatGeneration,
            }),
          ...(typeof mediaSession === "string" &&
            UUID.test(mediaSession) && {
              [MEDIA_SESSION_ATTRIBUTE]: mediaSession,
            }),
        },
      },
      clientContext: [
        storeNow(),
        flowContext(flows),
        ...(hint ? [hint] : []),
        ...(photos ? [photos] : []),
        ...(storyEdit
          ? [
              `The owner selected an existing story and requested image edits, not a new flow or a new design. Call edit_story with this exact validated input: ${JSON.stringify(storyEdit)}. Never call design_story for this revision. Then propose the new image with instagram__save_post for review; preserve the current account, existing post id if editing a saved draft, and timing. Do not automatically approve the new image.`,
            ]
          : []),
      ],
    }
  },
})

/** A message's text, from a string or its text parts. */
function messageText(message: MessageContent) {
  if (typeof message === "string") return message
  return message
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n")
}
