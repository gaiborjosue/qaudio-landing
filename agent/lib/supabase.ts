import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "../../lib/supabase/database.types"

// The agent talks to Supabase only as the signed-in admin: the admin chat
// sends the admin's Supabase access token, the eve channel verifies it, and
// tools use it, so RLS applies to every read and write. The agent never holds
// the secret key.

export type AdminSupabase = SupabaseClient<Database>

/** Route-auth attribute that carries the caller's Supabase access token. */
export const ACCESS_TOKEN_ATTRIBUTE = "supabaseAccessToken"

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)."
    )
  }
  return { url, key }
}

export function supabaseIssuer() {
  return `${config().url}/auth/v1`
}

function clientFor(token: string): AdminSupabase {
  const { url, key } = config()
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

export type VerifiedAdmin = { userId: string; email: string }

// Each chat request (including stream reconnects) is verified; a short cache
// keeps that to one Auth check and one admin lookup per token per minute.
const VERIFY_TTL_MS = 60_000
const verified = new Map<string, { admin: VerifiedAdmin; until: number }>()

/**
 * Verifies a Supabase access token and checks private.admins. Returns the
 * admin, "invalid" for a bad or expired token, or "forbidden" for a signed-in
 * user who isn't an admin.
 */
export async function verifyAdminToken(
  token: string
): Promise<VerifiedAdmin | "invalid" | "forbidden"> {
  const now = Date.now()
  const cached = verified.get(token)
  if (cached && cached.until > now) return cached.admin

  const supabase = clientFor(token)
  const { data, error } = await supabase.auth.getClaims(token)
  const claims = data?.claims
  if (error || !claims?.sub) return "invalid"
  const { data: isAdmin, error: rpcError } = await supabase.rpc("is_admin")
  if (rpcError) return "invalid"
  if (isAdmin !== true) return "forbidden"

  const admin = {
    userId: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
  }
  const expires = typeof claims.exp === "number" ? claims.exp * 1000 : now
  verified.set(token, { admin, until: Math.min(now + VERIFY_TTL_MS, expires) })
  if (verified.size > 200) {
    for (const [key, entry] of verified) {
      if (entry.until <= now) verified.delete(key)
    }
  }
  return admin
}

type CallerContext = {
  readonly session: {
    readonly auth: {
      readonly current: {
        readonly principalType: string
        readonly attributes: Readonly<
          Record<string, string | readonly string[]>
        >
      } | null
    }
  }
}

/** Supabase as the admin whose turn called the tool. */
export function callerSupabase(ctx: CallerContext): AdminSupabase {
  const caller = ctx.session.auth.current
  const token = caller?.attributes[ACCESS_TOKEN_ATTRIBUTE]
  if (caller?.principalType !== "user" || typeof token !== "string") {
    throw new Error(
      "No signed-in admin on this request. Ask the owner to sign in at /admin and send the request from there."
    )
  }
  return clientFor(token)
}

type DatabaseError = { code?: string; message: string } | null

/** Turns a Supabase error into a message the model can act on. */
export function failure(what: string, error: NonNullable<DatabaseError>) {
  if (
    /jwt/i.test(error.message) ||
    error.code === "PGRST301" ||
    error.code === "PGRST303"
  ) {
    return new Error(
      `${what}: the admin session expired. Ask the owner to send any message (the page refreshes the session), then try again.`
    )
  }
  if (error.code === "23505") {
    return new Error(`${what}: that slug is already used by another product.`)
  }
  if (error.code === "23503") {
    return new Error(
      `${what}: unknown category or brand slug. Use products__list_catalog for valid slugs.`
    )
  }
  if (error.code === "23514") {
    return new Error(
      `${what}: a value breaks a database rule (${error.message}).`
    )
  }
  if (error.code === "42501") {
    return new Error(
      `${what}: not allowed. Only site admins can make this change.`
    )
  }
  return new Error(`${what}: ${error.message}`)
}
