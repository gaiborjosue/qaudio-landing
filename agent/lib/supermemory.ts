import supermemory, { type SupermemoryOptions } from "@supermemory/eve"
import { defineMemoryProvider } from "eve/memory"

/**
 * @supermemory/eve 0.1.x targets eve 0.x, where recall also ran after
 * compaction. eve 1.0 rejects that hook because it keeps recalled messages
 * across compaction itself, so only the hooks eve 1.0 accepts are passed on.
 * Capture and the tools are the provider's own, minus any named in
 * `omitTools`. Drop this wrapper once the provider supports eve 1.0.
 */
export function supermemoryForEve(
  options: SupermemoryOptions,
  { omitTools = [] }: { omitTools?: readonly string[] } = {}
) {
  const { recall, capture, tools } = supermemory(options)
  return defineMemoryProvider({
    recall: { "turn.started": recall["turn.started"] },
    ...(capture && { capture }),
    ...(tools && {
      async tools(context) {
        const set = await tools(context)
        if (!set) return set
        return Object.fromEntries(
          Object.entries(set).filter(([name]) => !omitTools.includes(name))
        )
      },
    }),
  })
}
