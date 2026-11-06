import type { LanguageModelMiddleware, ProviderMetadata } from "ai"
import { validCost } from "../../lib/admin/model-cost"

/**
 * eve 1.0.0-rc.1 only reads providerMetadata.gateway.cost. Bridge the
 * OpenRouter receipt into that cost slot, preserving the original metadata
 * and provider/model identity. This does not route requests through Gateway.
 * Remove when eve reads OpenRouter's usage.cost itself.
 */
function eveCost(metadata: ProviderMetadata | undefined) {
  const usage = metadata?.openrouter?.usage
  const cost =
    usage && typeof usage === "object" && !Array.isArray(usage)
      ? (usage as { cost?: unknown }).cost
      : undefined
  if (!validCost(cost)) return metadata
  return { ...metadata, gateway: { ...metadata?.gateway, cost } }
}

export const openRouterUsage: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate()
    return { ...result, providerMetadata: eveCost(result.providerMetadata) }
  },
  wrapStream: async ({ doStream }) => {
    const result = await doStream()
    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(
              chunk.type === "finish"
                ? {
                    ...chunk,
                    providerMetadata: eveCost(chunk.providerMetadata),
                  }
                : chunk
            )
          },
        })
      ),
    }
  },
}
