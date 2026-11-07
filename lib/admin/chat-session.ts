import { SessionNotActiveError } from "eve/client"

type End = () => Promise<{
  result(options: { signal: AbortSignal }): Promise<{ sessionEnded: boolean }>
}>

/** Coordinates accepted input with an explicit, confirmed session retirement. */
export class ChatSession {
  sessionId: string | undefined
  private pending = new Set<Promise<unknown>>()
  private retirement: AbortController | undefined
  private generation = 0

  constructor(sessionId?: string) {
    this.sessionId = sessionId
  }

  get ending() {
    return this.retirement !== undefined
  }

  get version() {
    return this.generation
  }

  async request<T>(
    submit: () => Promise<T>,
    version = this.generation
  ): Promise<T> {
    if (version !== this.generation)
      throw new DOMException("This chat changed.", "AbortError")
    if (this.retirement) throw new Error("This chat is ending.")
    const request = Promise.resolve().then(submit)
    this.pending.add(request)
    try {
      return await request
    } finally {
      this.pending.delete(request)
    }
  }

  async retire(
    end: End,
    reset: (sessionId?: string) => void | Promise<void>,
    timeoutMs = 20_000
  ) {
    if (this.retirement) return
    const controller = new AbortController()
    this.retirement = controller
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(timeoutMs),
    ])
    try {
      // Creation can be in flight before React has rendered its session ID.
      await waitFor(Promise.allSettled([...this.pending]), signal)
      const sessionId = this.sessionId
      if (sessionId) {
        try {
          signal.throwIfAborted()
          const receipt = await waitFor(end(), signal)
          const result = await receipt.result({ signal })
          if (!result.sessionEnded) throw new Error("The chat hasn't ended.")
        } catch (error) {
          // A definite inactive response is safe; network failures aren't.
          if (!SessionNotActiveError.is(error) || error.retryable) throw error
        }
      }
      signal.throwIfAborted()
      this.generation += 1
      await reset(sessionId)
    } finally {
      this.retirement = undefined
    }
  }

  disconnect() {
    this.retirement?.abort()
  }
}

/** Bounds an SDK operation that doesn't itself accept an abort signal. */
function waitFor<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener("abort", abort, { once: true })
    operation.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", abort)
    })
  })
}
