import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

// Admin pages only: refreshes the Supabase session cookies and sends signed-out
// visitors to the sign-in page. This is an optimistic check; pages and Server
// Actions verify the admin themselves, and the agent verifies every request.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
          for (const [key, value] of Object.entries(headers)) {
            response.headers.set(key, value)
          }
        },
      },
    }
  )
  const { data } = await supabase.auth.getClaims()

  const signIn = request.nextUrl.pathname === "/admin/login"
  if (!data?.claims && !signIn) {
    const redirect = NextResponse.redirect(new URL("/admin/login", request.url))
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie)
    return redirect
  }
  return response
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
}
