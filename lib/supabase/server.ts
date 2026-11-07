import "server-only"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { createServerClient } from "@supabase/ssr"
import type { Database } from "./database"

/**
 * Supabase as the signed-in user, from the request's auth cookies, so RLS
 * applies to them. Create one per request; Server Components can't set
 * cookies, so refreshed tokens are written by proxy.ts and Server Actions.
 * Session reads wait for a real request: Supabase compares the token's
 * expiry with the clock, which can't run while Next prefetches the page.
 */
export async function sessionSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)."
    )
  }
  await connection()
  const cookieStore = await cookies()
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, which can't set cookies.
        }
      },
    },
  })
}
