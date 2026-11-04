import {
  instagramPhotoSchema,
  instagramPostInputSchema,
  type InstagramPostInput,
} from "./schemas"
import { previewToolName } from "./tool-names"

// The admin chat's "Approve in this order" for Instagram carousels. A tool's
// input can't change once proposed, so the chat sends the owner's photo order
// to the agent in an "Approved photo order:" line, and the agent proposes the
// same post with it. That next card counts as approved only when it is
// exactly that post with exactly those photos; anything else waits for the
// owner as usual. Pure, so it's read from the conversation (a reload keeps
// it) and tested in scripts/zernio.test.mjs.

export const APPROVED_PHOTO_ORDER = "Approved photo order"
export const PHOTO_ORDER = "Photo order"
const APPROVED_LINE = new RegExp(`^${APPROVED_PHOTO_ORDER}: (.+)$`, "m")

/** JSON with sorted keys, so equal posts compare equal. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

/** The owner's message approving `photos`, in that order. */
export function approvedOrderMessage(photos: InstagramPostInput["photos"]) {
  return `Approve it with the photos in the order I arranged.\n${APPROVED_PHOTO_ORDER}: ${JSON.stringify(photos)}`
}

type Message = { readonly role: string; readonly parts: readonly unknown[] }

/** Tool call ids of Instagram cards the owner approved by their order. */
export function arrangedApprovals(messages: readonly Message[]) {
  const approved = new Set<string>()
  let card: InstagramPostInput | null = null
  let expected: string | null = null
  for (const message of messages) {
    for (const item of message.parts) {
      const part = item as Record<string, unknown>
      if (
        part.type === "tool" &&
        typeof part.name === "string" &&
        typeof part.callId === "string" &&
        previewToolName(part.name) === "save_instagram_post"
      ) {
        // A card still streaming its input doesn't parse yet; wait for it.
        const input = instagramPostInputSchema.safeParse(part.input)
        if (!input.success) continue
        if (expected !== null && canonical(input.data) === expected) {
          approved.add(part.callId)
        }
        expected = null
        card = input.data
      } else if (
        message.role === "user" &&
        part.type === "text" &&
        typeof part.text === "string"
      ) {
        // Any later word from the owner cancels an earlier approval.
        expected = null
        const line = part.text.match(APPROVED_LINE)?.[1]
        if (!line || !card) continue
        try {
          const photos = instagramPhotoSchema.array().parse(JSON.parse(line))
          // Only a new order of the card's own photos.
          const same = (list: unknown[]) => list.map(canonical).sort().join()
          if (same(photos) !== same(card.photos)) continue
          const post = instagramPostInputSchema.safeParse({ ...card, photos })
          if (post.success) expected = canonical(post.data)
        } catch {
          // Not an order; the next card waits for the owner.
        }
      }
    }
  }
  return approved
}
