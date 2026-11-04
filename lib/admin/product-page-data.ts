import "server-only"
import { cacheLife, cacheTag } from "next/cache"
import { extractPage, PrefillProblem } from "./product-page"

/** Only the page read is shared; drafts and staged uploads belong to each request. */
export async function getProductPage(address: string, humanId?: string) {
  const result = await cachedProductPage(address, humanId)
  // Keep the route's safe status codes across the cache's serialization.
  if ("error" in result) {
    throw new PrefillProblem(result.error.message, result.error.status)
  }
  return result.page
}

async function cachedProductPage(
  address: string,
  humanId?: string
): Promise<
  | { page: Awaited<ReturnType<typeof extractPage>> }
  | { error: { message: string; status: number } }
> {
  "use cache"
  cacheTag("product-pages")
  try {
    const apiKey = process.env.TAVILY_API_KEY?.trim()
    if (!apiKey) throw new PrefillProblem("Prefill isn’t set up yet.", 503)
    const page = await extractPage(new URL(address), {
      apiKey,
      humanId,
      // A closing editor must not cancel another request's shared page read.
      signal: AbortSignal.timeout(35_000),
    })
    // Reuse a successful read for a day, then refresh on the next request.
    // After another minute, callers must wait for the fresh page.
    cacheLife({ revalidate: 86_400, expire: 86_460 })
    return { page }
  } catch (error) {
    // Transient failures must stay retryable, without serializing exceptions
    // (or provider details) into the cache.
    cacheLife({ revalidate: 0, expire: 1 })
    return {
      error:
        error instanceof PrefillProblem
          ? { message: error.message, status: error.status }
          : { message: "Couldn’t read this page. Try again.", status: 502 },
    }
  }
}
