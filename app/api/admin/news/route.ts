import { getAdmin } from "@/lib/admin/auth"
import { readNewsPost } from "@/lib/admin/news-save"
import { sessionSupabase } from "@/lib/supabase/server"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One full post for the News tab's form, read as the admin (RLS). */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (!(await getAdmin())) return Response.json(null, { status: 401, headers })
  const id = new URL(request.url).searchParams.get("id") ?? ""
  if (!UUID.test(id)) return Response.json(null, { status: 400, headers })
  try {
    const post = await readNewsPost(
      await sessionSupabase(),
      { id },
      (what, error) => new Error(`${what}: ${error.message}`)
    )
    return Response.json(post, { status: post ? 200 : 404, headers })
  } catch {
    return Response.json(null, { status: 500, headers })
  }
}
