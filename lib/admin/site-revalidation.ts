import { z } from "zod"
import { SITE_CACHE_TAGS, siteCacheTags } from "./site-cache"

type Dependencies = {
  verify: (token: string) => Promise<object | "invalid" | "forbidden">
  revalidate: (tag: string) => void
}

const input = z
  .object({ tags: z.array(z.enum(SITE_CACHE_TAGS)).min(1).max(4) })
  .strict()

/** The agent uses its caller's bearer token, independently of browser cookies. */
export async function revalidationRequest(
  request: Request,
  { verify, revalidate }: Dependencies
) {
  const reply = (status: number) =>
    new Response(null, {
      status,
      headers: { "Cache-Control": "no-store" },
    })
  const token = /^Bearer (\S+)$/i.exec(
    request.headers.get("authorization") ?? ""
  )?.[1]
  if (!token) return reply(401)
  try {
    const caller = await verify(token)
    if (caller === "invalid" || !caller) return reply(401)
    if (caller === "forbidden") return reply(403)
    const parsed = input.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return reply(400)
    const tags = siteCacheTags(parsed.data.tags)
    for (const tag of tags) revalidate(tag)
    return reply(204)
  } catch {
    return reply(503)
  }
}
