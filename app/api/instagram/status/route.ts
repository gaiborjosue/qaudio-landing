import { getAdmin } from "@/lib/admin/auth"
import { instagramStatus } from "@/lib/admin/zernio"

export async function GET() {
  const headers = {
    "Cache-Control": "private, no-store, max-age=0",
    Vary: "Cookie",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
  }
  if (!(await getAdmin()))
    return Response.json(
      { error: "Sign in to check Instagram." },
      { status: 401, headers }
    )
  return Response.json(await instagramStatus(), { headers })
}
