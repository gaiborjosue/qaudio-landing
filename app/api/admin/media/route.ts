import { getAdmin } from "@/lib/admin/auth"
import { CHAT_BUCKET, isPrivateUpload } from "@/lib/admin/media-lifecycle"
import { sessionSupabase } from "@/lib/supabase/server"

/** Same-origin previews authenticate on every URL refresh. No public originals. */
export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  if (!(await getAdmin())) return new Response(null, { status: 401, headers })
  const path = new URL(request.url).searchParams.get("path") ?? ""
  if (!isPrivateUpload(path))
    return new Response(null, { status: 400, headers })
  const supabase = await sessionSupabase()
  const { data, error } = await supabase.storage
    .from(CHAT_BUCKET)
    .createSignedUrl(path, 300)
  if (error || !data?.signedUrl)
    return new Response(null, { status: 404, headers })
  return new Response(null, {
    status: 307,
    headers: { ...headers, Location: data.signedUrl },
  })
}
