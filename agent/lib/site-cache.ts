import { siteCacheTags } from "../../lib/admin/site-cache"
import { ACCESS_TOKEN_ATTRIBUTE, type CallerContext } from "./supabase"

/** Only server configuration chooses where the caller's credential is sent. */
export function siteOrigin(env = process.env) {
  const origin =
    env.SITE_ORIGIN ||
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : "http://localhost:3000")
  const url = new URL(origin)
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && local))
  )
    throw new Error("Set SITE_ORIGIN to the website's origin.")
  return url.origin
}

/** Refresh only; a failure after saving must never turn into a repeated write. */
export async function refreshAfterSave<T extends { revalidate: string[] }>(
  ctx: CallerContext,
  saved: T
): Promise<
  T & { cacheRefresh: "complete" | "pending"; cacheWarning?: string }
> {
  try {
    const caller = ctx.session.auth.current
    const token = caller?.attributes[ACCESS_TOKEN_ATTRIBUTE]
    if (caller?.principalType !== "user" || typeof token !== "string")
      throw new Error("No admin credential.")
    const endpoint = new URL("/api/admin/revalidate", siteOrigin())
    const tags = siteCacheTags(saved.revalidate)
    if (!tags.length) throw new Error("No site cache tags.")
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ tags }),
          redirect: "error",
          signal: AbortSignal.timeout(5_000),
        })
        await response.body?.cancel()
        if (response.status === 204)
          return { ...saved, cacheRefresh: "complete" }
        if (response.status < 500) break
      } catch {
        // Retrying cache invalidation is safe, including a lost response.
      }
    }
  } catch {
    // Invalid server configuration and unavailable credentials are safe failures.
  }
  console.warn("Saved site content; cache refresh is pending.")
  return {
    ...saved,
    cacheRefresh: "pending",
    cacheWarning:
      "The change was saved. Cache refresh is pending; do not repeat the save. The chat can retry the refresh when reopened.",
  }
}
