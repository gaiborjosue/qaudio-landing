/** Public URL of a file in the Supabase media storage bucket. */
export function mediaUrl(path: string) {
  const encoded = path.split("/").map(encodeURIComponent).join("/")
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${encoded}`
}
