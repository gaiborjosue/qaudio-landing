import "server-only"
import { redirect } from "next/navigation"
import { sessionSupabase } from "@/lib/supabase/server"

export type Admin = { id: string; email: string }

/**
 * The signed-in site admin, or null. Verifies the session token and checks
 * private.admins on every call (through public.is_admin()), so revoking an
 * admin takes effect on their next request. Reads cookies, so callers render
 * inside <Suspense>.
 */
export async function getAdmin(): Promise<Admin | null> {
  const supabase = await sessionSupabase()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  const { data: isAdmin, error } = await supabase.rpc("is_admin")
  if (error || isAdmin !== true) return null
  return {
    id: claims.sub,
    email: typeof claims.email === "string" ? claims.email : "",
  }
}

/** The signed-in admin; anyone else is sent to the sign-in page. */
export async function requireAdmin(): Promise<Admin> {
  const admin = await getAdmin()
  if (!admin) redirect("/admin/login")
  return admin
}
