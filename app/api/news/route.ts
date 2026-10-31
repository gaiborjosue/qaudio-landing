import type { NextRequest } from "next/server"
import { NEWS_MAX_PAGE_SIZE, NEWS_PAGE_SIZE } from "@/lib/news"
import { getNewsPage } from "@/lib/news-data"

// Feed pages for /news: GET /api/news?cursor=<nextCursor>&limit=<n>.
// Results come from the cached reads in lib/news-data.ts.
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const limitParam = searchParams.get("limit")
  const limit = limitParam === null ? NEWS_PAGE_SIZE : Number(limitParam)
  if (!Number.isInteger(limit) || limit < 1 || limit > NEWS_MAX_PAGE_SIZE) {
    return Response.json({ error: "Invalid limit" }, { status: 400 })
  }
  const page = await getNewsPage(searchParams.get("cursor"), limit)
  if (!page) return Response.json({ error: "Invalid cursor" }, { status: 400 })
  return Response.json(page)
}
