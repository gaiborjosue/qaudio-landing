import { VOICE_MAX_BYTES, VOICE_MAX_SECONDS, voiceExtension } from "./speech"

type VoiceState = {
  phase: "idle" | "requesting" | "recording" | "transcribing"
  stream: MediaStream | null
  seconds: number
  error: string | null
}

const IDLE: VoiceState = {
  phase: "idle",
  stream: null,
  seconds: 0,
  error: null,
}
const MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
]
type Recording = {
  abort: AbortController
  chunks: Blob[]
  bytes: number
  stream?: MediaStream
  recorder?: MediaRecorder
  timer?: ReturnType<typeof setInterval>
}

/** One cancellable recording, including permission and the final HTTP request. */
export class VoiceRecorder {
  private state = IDLE
  private job: Recording | null = null
  private listeners = new Set<() => void>()

  getSnapshot = () => this.state
  getServerSnapshot = () => IDLE
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private publish(state: VoiceState) {
    this.state = state
    for (const listener of this.listeners) listener()
  }

  private releaseCapture(job: Recording) {
    clearInterval(job.timer)
    job.stream?.getTracks().forEach((track) => track.stop())
  }

  cancel = () => {
    const job = this.job
    this.job = null
    if (job) {
      job.abort.abort()
      if (job.recorder) {
        job.recorder.ondataavailable = null
        job.recorder.onstop = null
        job.recorder.onerror = null
        try {
          if (job.recorder.state !== "inactive") job.recorder.stop()
        } catch {
          // A failed device still needs its tracks and request released.
        }
      }
      this.releaseCapture(job)
      job.chunks = []
    }
    this.publish(IDLE)
  }

  private fail(job: Recording, message: string) {
    if (this.job !== job) return
    this.cancel()
    this.publish({ ...IDLE, error: message })
  }

  start = async (onTranscript: (text: string) => void) => {
    if (this.job) return
    if (
      !globalThis.isSecureContext ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      this.publish({
        ...IDLE,
        error:
          "Voice input needs HTTPS (or localhost) and a browser with microphone recording.",
      })
      return
    }
    const job: Recording = {
      abort: new AbortController(),
      chunks: [],
      bytes: 0,
    }
    this.job = job
    this.publish({ ...IDLE, phase: "requesting" })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      })
      // A permission prompt can outlive this chat, a tab switch, or Cancel.
      if (this.job !== job) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      job.stream = stream
      const mimeType = MIME_TYPES.find((type) =>
        MediaRecorder.isTypeSupported(type)
      )
      const recorder = new MediaRecorder(stream, {
        ...(mimeType && { mimeType }),
        audioBitsPerSecond: 64_000,
      })
      job.recorder = recorder
      recorder.ondataavailable = (event) => {
        if (this.job !== job || !event.data.size) return
        job.bytes += event.data.size
        if (job.bytes > VOICE_MAX_BYTES) {
          this.fail(job, "Recording is too large. Try a shorter one.")
          return
        }
        job.chunks.push(event.data)
      }
      recorder.onerror = () =>
        this.fail(job, "Recording was interrupted. Please try again.")
      recorder.onstop = () => {
        if (this.job !== job) return
        this.releaseCapture(job)
        this.publish({ ...this.state, phase: "transcribing", stream: null })
        void this.transcribe(job, recorder.mimeType, onTranscript)
      }
      recorder.start(250)
      const startedAt = Date.now()
      this.publish({ ...IDLE, phase: "recording", stream })
      job.timer = setInterval(() => {
        if (this.job !== job) return
        const seconds = Math.min(
          VOICE_MAX_SECONDS,
          Math.floor((Date.now() - startedAt) / 1000)
        )
        if (seconds !== this.state.seconds)
          this.publish({ ...this.state, seconds })
        if (seconds >= VOICE_MAX_SECONDS) this.stop()
      }, 250)
    } catch (error) {
      const name = error instanceof Error ? error.name : ""
      this.fail(
        job,
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access is blocked. Allow it in your browser’s site settings and try again."
          : name === "NotFoundError"
            ? "No microphone found. Connect one and try again."
            : "Couldn’t start the microphone. Check that it is available and try again."
      )
    }
  }

  stop = () => {
    const job = this.job
    if (!job?.recorder || job.recorder.state !== "recording") return
    this.publish({ ...this.state, phase: "transcribing", stream: null })
    try {
      job.recorder.stop()
      this.releaseCapture(job)
    } catch {
      this.fail(job, "Recording was interrupted. Please try again.")
    }
  }

  private async transcribe(
    job: Recording,
    mimeType: string,
    onTranscript: (text: string) => void
  ) {
    const type = mimeType || job.chunks[0]?.type || ""
    const extension = voiceExtension(type)
    if (!extension)
      return this.fail(job, "This browser’s audio format is not supported.")
    const audio = new Blob(job.chunks, { type })
    job.chunks = []
    if (!audio.size)
      return this.fail(job, "No audio recorded. Please try again.")
    const body = new FormData()
    body.set("file", audio, `voice.${extension}`)
    try {
      const response = await fetch("/api/admin/speech", {
        method: "POST",
        body,
        credentials: "same-origin",
        signal: AbortSignal.any([
          job.abort.signal,
          AbortSignal.timeout(60_000),
        ]),
      })
      const result = (await response.json()) as {
        text?: unknown
        error?: unknown
      }
      if (this.job !== job) return
      if (
        !response.ok ||
        typeof result.text !== "string" ||
        !result.text.trim()
      ) {
        this.fail(
          job,
          typeof result.error === "string"
            ? result.error
            : "Couldn’t transcribe the recording. Please try again."
        )
        return
      }
      onTranscript(result.text.trim())
      this.job = null
      this.publish(IDLE)
    } catch {
      this.fail(
        job,
        "Voice input was interrupted or timed out. Please try again."
      )
    }
  }
}
