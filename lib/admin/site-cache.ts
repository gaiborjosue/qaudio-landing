import type { SessionStreamEvent } from "eve/client"

export const SITE_CACHE_TAGS = [
  "store-hours",
  "catalog",
  "news",
  "deals",
] as const
export type SiteCacheTag = (typeof SITE_CACHE_TAGS)[number]

export function siteCacheTags(value: unknown): SiteCacheTag[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value)].filter(
    (tag): tag is SiteCacheTag =>
      typeof tag === "string" && SITE_CACHE_TAGS.includes(tag as SiteCacheTag)
  )
}

/** Live and replayed saves use the same queue; failed refreshes stay pending. */
export class ChatCacheRefresh {
  private pending = new Map<string, SiteCacheTag[]>()
  private refreshed = new Set<string>()
  private flushing: Promise<boolean> | undefined

  observe(event: SessionStreamEvent) {
    if (event.type !== "call.settled" || event.data.outcome !== "completed")
      return
    const { callId, output } = event.data
    if (this.refreshed.has(callId) || !output || typeof output !== "object")
      return
    const tags = siteCacheTags(
      "revalidate" in output ? output.revalidate : null
    )
    if (tags.length) this.pending.set(callId, tags)
  }

  flush(refresh: (tags: SiteCacheTag[]) => Promise<void>): Promise<boolean> {
    if (this.flushing) return this.flushing
    const run = async () => {
      let changed = false
      while (this.pending.size) {
        const batch = new Map(this.pending)
        await refresh(siteCacheTags([...batch.values()].flat()))
        for (const id of batch.keys()) {
          this.pending.delete(id)
          this.refreshed.add(id)
        }
        changed = true
      }
      return changed
    }
    this.flushing = run().finally(() => {
      this.flushing = undefined
    })
    return this.flushing
  }
}
