/** Keep recordings below the host's 4.5 MB request limit, including multipart overhead. */
export const VOICE_MAX_BYTES = 4 * 1024 * 1024
export const VOICE_MAX_SECONDS = 180

export function voiceExtension(type: string): string | null {
  switch (type.split(";")[0].trim().toLowerCase()) {
    case "audio/webm":
    case "video/webm":
      return "webm"
    case "audio/mp4":
    case "video/mp4":
    case "audio/x-m4a":
      return "m4a"
    case "audio/ogg":
      return "ogg"
    default:
      return null
  }
}
