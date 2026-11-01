import { createBrowserClient } from "@supabase/ssr"
import type { Database } from "./database.types"

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Supabase in the browser as the signed-in admin (auth cookies), for the
 * admin chat: it supplies the access token the agent verifies and uploads
 * pasted photos, both under RLS.
 */
export function browserSupabase() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
  return client
}
