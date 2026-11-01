import type { NextRequest } from "next/server"
import { redirect } from "next/navigation"
import type { EmailOtpType } from "@supabase/supabase-js"
import { sessionSupabase } from "@/lib/supabase/server"

const OTP_TYPES = new Set<EmailOtpType>([
  "recovery",
  "invite",
  "magiclink",
  "email",
])

/**
 * Supabase email links (password reset, invites) land here, set the session
 * cookies, and continue to an admin page. Accepts the PKCE `code` from links
 * the site requested and the `token_hash` form of the SSR email templates.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const next = params.get("next")
  const target =
    next?.startsWith("/admin/") && !next.startsWith("//") ? next : "/admin"

  const supabase = await sessionSupabase()
  const code = params.get("code")
  const tokenHash = params.get("token_hash")
  const type = params.get("type") as EmailOtpType | null

  let ok = false
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    ok = !(await supabase.auth.verifyOtp({ type, token_hash: tokenHash })).error
  }
  redirect(ok ? target : "/admin/login?link=expired")
}
