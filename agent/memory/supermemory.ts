import { defineMemory } from "eve/memory"
import { byPrincipal } from "eve/memory/scope"
import { STORE_TIME_ZONE } from "../../lib/store-hours"
import { supermemoryForEve } from "../lib/supermemory"

// Long-term memory for the admin chat. Chats are disposable (New chat ends the
// session), so whatever should outlive one is captured here after each turn.
// Each signed-in admin has their own memory; the default namespace keeps
// development, previews, and production apart.
export default defineMemory({
  description:
    "The owner's lasting preferences and conventions for running the site. Never catalog, hours, deal, or news data: the site stores those.",
  provider: supermemoryForEve(
    {
      // A function reads the key when the agent runs, so `eve build` doesn't
      // need it. Without a key, memory quietly does nothing.
      apiKey: () => process.env.SUPERMEMORY_API_KEY!,
      profileContext: { timeZone: STORE_TIME_ZONE },
      capture: {
        // Supabase holds the facts; memory holds how the owner likes things done.
        entityContext:
          "Learn only lasting preferences and decisions the owner states: how product copy, news posts, and deals should read (tone, length, spelling, how brands and models are named), how photos and alt text should be handled, recurring patterns to assume, and corrections to the assistant's work. Never record catalog data, prices, specs, store hours, dates, deal or news content (the site stores those), photo paths or sizes, one-off requests, approvals, or credentials.",
      },
    },
    // `extract` tells the model to index every attached file, and the owner
    // attaches product photos to most chats; `read_document` only reads what
    // `extract` indexed.
    { omitTools: ["extract", "read_document"] }
  ),
  scope: byPrincipal,
})
