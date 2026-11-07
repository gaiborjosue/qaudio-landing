import type { UseEveAgentReturn } from "eve/react"

/**
 * What the thread's cards and questions can do. Its functions are stable
 * session-coordinated send and respond, so the object only changes when blocked:
 * finished turns then skip re-rendering while a reply streams in.
 */
export type ChatActions = {
  send: UseEveAgentReturn["send"]
  respond: UseEveAgentReturn["respond"]
  /** Catching up or retiring the chat: answering waits. */
  resuming: boolean
}
