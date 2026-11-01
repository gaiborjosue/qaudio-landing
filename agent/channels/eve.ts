import {
  ForbiddenError,
  UnauthenticatedError,
  extractBearerToken,
  localDev,
  withAuthChallenges,
  type AuthFn,
} from "eve/channels/auth"
import { defaultEveAuth, eveChannel } from "eve/channels/eve"
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
  // Photos are uploaded from the browser and sent as public media URLs.
  uploadPolicy: { maxBytes: 3 * 1024 * 1024, allowedMediaTypes: ["image/*"] },
  onMessage: (ctx) => ({
    auth: defaultEveAuth(ctx),
    clientContext: [storeNow()],
  }),
})
