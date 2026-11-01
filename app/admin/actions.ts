"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { updateTag } from "next/cache"
import { getAdmin } from "@/lib/admin/auth"
import { CATALOG_CACHE_TAG } from "@/lib/catalog-data"
import { DEALS_CACHE_TAG } from "@/lib/deals-data"
import { NEWS_CACHE_TAG } from "@/lib/news-data"
import { STORE_HOURS_CACHE_TAG } from "@/lib/store-hours-data"
import { sessionSupabase } from "@/lib/supabase/server"

export type FormState = { error: string } | { message: string } | null

export async function signIn(
  _previous: FormState,
  form: FormData
): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  if (!email || !password || email.length > 320 || password.length > 200) {
    return { error: "Enter your email and password." }
  }
  const supabase = await sessionSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: "That email and password don’t match." }
  const { data: isAdmin } = await supabase.rpc("is_admin")
  if (isAdmin !== true) {
    await supabase.auth.signOut()
    return { error: "This account can’t manage the site." }
  }
  redirect("/admin")
}

/**
 * Emails a password reset link. The link returns through /auth/confirm (PKCE:
 * open it in the browser that asked for it) to /admin/set-password. The reply
 * is the same whether or not the account exists.
 */
export async function requestPasswordReset(
  _previous: FormState,
  form: FormData
): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim()
  if (!email || email.length > 320) return { error: "Enter your email." }
  const origin = (await headers()).get("origin")
  if (!origin) return { error: "Couldn’t send the link. Try again." }
  const supabase = await sessionSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/admin/set-password`,
  })
  if (error?.status === 429) {
    return {
      error: "Too many emails were sent. Wait a few minutes and try again.",
    }
  }
  return {
    message:
      "If that address has an account, a reset link is on its way. Open it in this browser.",
  }
}

/** Sets a new password for the signed-in user (after a reset or invite link). */
export async function setPassword(
  _previous: FormState,
  form: FormData
): Promise<FormState> {
  const password = String(form.get("password") ?? "")
  const confirm = String(form.get("confirm") ?? "")
  if (password.length < 10 || password.length > 72) {
    return { error: "Use 10 to 72 characters." }
  }
  if (password !== confirm) return { error: "The passwords don’t match." }
  const supabase = await sessionSupabase()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect("/admin/login")
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  const { data: isAdmin } = await supabase.rpc("is_admin")
  if (isAdmin !== true) {
    await supabase.auth.signOut()
    return { error: "Password saved, but this account can’t manage the site." }
  }
  redirect("/admin")
}

export async function signOut() {
  const supabase = await sessionSupabase()
  await supabase.auth.signOut()
  redirect("/admin/login")
}

// Cache tags the admin agent's saves can refresh.
const SITE_TAGS = new Set([
  STORE_HOURS_CACHE_TAG,
  CATALOG_CACHE_TAG,
  NEWS_CACHE_TAG,
  DEALS_CACHE_TAG,
])

/**
 * Shows the agent's approved saves on the site right away. The agent writes
 * as the admin (RLS) from its own process, which can't reach Next's cache, so
 * the admin chat calls this once a save completes.
 */
export async function refreshSiteContent(tags: string[]) {
  if (!(await getAdmin())) throw new Error("Sign in as an admin.")
  if (!Array.isArray(tags)) return
  for (const tag of new Set(tags)) {
    if (typeof tag === "string" && SITE_TAGS.has(tag)) updateTag(tag)
  }
}
