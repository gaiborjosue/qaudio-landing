/** Public URL of a file in the Supabase media storage bucket. */
export function mediaUrl(path: string) {
  if (/^uploads\/chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/.test(path))
    return `/api/admin/media?path=${encodeURIComponent(path)}`
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${encoded}`
}

/** Authenticated images must be fetched by the browser, not Next's optimizer. */
export const isPrivateMediaUrl = (url: string) =>
  url.startsWith("/api/admin/media?")
