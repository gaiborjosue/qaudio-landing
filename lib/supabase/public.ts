import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

let client: ReturnType<typeof createClient<Database>> | undefined

/**
 * Supabase as an anonymous visitor (publishable key, no session): it can only
 * read what RLS makes public, such as published news.
 */
export function publicSupabase() {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)."
    )
  }
  client = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
  return client
}

export { mediaUrl } from "@/lib/media"
