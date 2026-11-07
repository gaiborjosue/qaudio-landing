import { revalidateTag } from "next/cache"
import { verifyAdminToken } from "@/agent/lib/supabase"
import { revalidationRequest } from "@/lib/admin/site-revalidation"

/** Approved agent writes refresh the site even after the browser disconnects. */
export async function POST(request: Request) {
  return revalidationRequest(request, {
    verify: verifyAdminToken,
    revalidate: (tag) => revalidateTag(tag, "max"),
  })
}
