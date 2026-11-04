import { VOICE_MAX_BYTES, voiceExtension } from "./speech"

const BODY_MAX_BYTES = VOICE_MAX_BYTES + 64 * 1024
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Robots-Tag": "noindex",
}

class SpeechProblem extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** Bound the actual body too: Content-Length can be absent or untrusted. */
async function audioForm(request: Request) {
  if (!request.body) throw new SpeechProblem("No recording received.", 400)
  const reader = request.body.getReader()
  const chunks: ArrayBuffer[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > BODY_MAX_BYTES) {
        await reader.cancel()
        throw new SpeechProblem(
          "Recording is too large. Try a shorter one.",
          413
        )
      }
      chunks.push(new Uint8Array(value).buffer)
    }
  } finally {
    reader.releaseLock()
  }
  return new Response(new Blob(chunks), {
    headers: { "Content-Type": request.headers.get("content-type")! },
  }).formData()
}

/** Server route implementation; dependencies let tests exercise the real boundary. */
export async function translateSpeech(
  request: Request,
  {
    authorize,
    apiKey,
    fetcher = fetch,
  }: {
    authorize: () => Promise<boolean>
    apiKey: string | undefined
    fetcher?: typeof fetch
  }
): Promise<Response> {
  const problem = (error: string, status: number) =>
    Response.json({ error }, { status, headers })

  if (!(await authorize())) return problem("Sign in to use voice input.", 401)
  // Multipart posts can be sent cross-site without a preflight. This endpoint
  // uses auth cookies and pays for processing, so require our browser origin.
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return problem("Voice input must be used from this site.", 403)
  if (!apiKey?.trim()) return problem("Voice input is not configured yet.", 503)
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    return problem("Send an audio recording.", 415)
  if (Number(request.headers.get("content-length")) > BODY_MAX_BYTES)
    return problem("Recording is too large. Try a shorter one.", 413)

  let form: FormData
  try {
    form = await audioForm(request)
  } catch (error) {
    return error instanceof SpeechProblem
      ? problem(error.message, error.status)
      : problem("The recording could not be read. Please try again.", 400)
  }
  const audio = form.get("file")
  if (!(audio instanceof File) || audio.size === 0)
    return problem("No audio recorded. Please try again.", 400)
  if (audio.size > VOICE_MAX_BYTES)
    return problem("Recording is too large. Try a shorter one.", 413)
  const extension = voiceExtension(audio.type)
  if (!extension) return problem("This audio format is not supported.", 415)

  const body = new FormData()
  body.set("file", audio, `voice.${extension}`)
  body.set("model", "whisper-large-v3")
  body.set("response_format", "json")
  body.set("temperature", "0")
  // Translations detects the spoken language and always returns English.
  // Never pass language=pl: that option is not supported by this endpoint.
  try {
    const response = await fetcher(
      "https://api.groq.com/openai/v1/audio/translations",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        body,
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
      }
    )
    if (!response.ok)
      return problem(
        response.status === 429
          ? "Voice input is busy. Please try again shortly."
          : "Couldn’t transcribe the recording. Please try again.",
        response.status === 429 ? 429 : 502
      )
    const result: unknown = await response.json()
    if (
      !result ||
      typeof result !== "object" ||
      !("text" in result) ||
      typeof result.text !== "string"
    )
      return problem(
        "Couldn’t transcribe the recording. Please try again.",
        502
      )
    const text = result.text.trim()
    if (!text) return problem("No speech detected. Please try again.", 422)
    return Response.json({ text }, { headers })
  } catch {
    // Neither provider replies nor exception messages may reach the browser/logs.
    return problem(
      "Voice input was interrupted or timed out. Please try again.",
      504
    )
  }
}
