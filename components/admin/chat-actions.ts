import type { UseEveAgentReturn } from "eve/react"

/**
 * What the thread's cards and questions can do. Its functions are eve's
 * stable send and respond, so the object only changes when `resuming` does:
 * finished turns then skip re-rendering while a reply streams in.
 */
export type ChatActions = {
  send: UseEveAgentReturn["send"]
  respond: UseEveAgentReturn["respond"]
  /** Catching up on a reopened chat: answering waits. */
  resuming: boolean
}
