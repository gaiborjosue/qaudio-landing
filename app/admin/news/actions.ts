"use server"

import { updateTag } from "next/cache"
import { getAdmin } from "@/lib/admin/auth"
import {
  deleteNewsPost,
  saveNewsPost,
  saveNewsQuickEdits,
} from "@/lib/admin/news-save"
import {
  deleteNewsPostInputSchema,
  newsPostInputSchema,
  newsQuickEditsSchema,
} from "@/lib/admin/schemas"
import { NEWS_CACHE_TAG } from "@/lib/news-data"
import { sessionSupabase } from "@/lib/supabase/server"

// The News tab's direct edits, saved as the signed-in admin (RLS). Pressing
// Save or Delete is the owner's approval, so nothing goes through the chat.

/** A save the owner can act on: why it failed, and the field if known. */
class OwnerError extends Error {
  constructor(
    message: string,
    readonly field?: string
  ) {
    super(message)
  }
}

// Database errors, worded for the owner rather than the model.
function ownerFail(what: string, error: { code?: string; message: string }) {
  if (/jwt/i.test(error.message) || error.code?.startsWith("PGRST30")) {
    return new OwnerError("Your session expired. Reload the page to sign in.")
  }
  if (error.code === "23505") {
    return new OwnerError("Another post already uses this address.", "slug")
  }
  if (error.code === "23514" && /published_complete/.test(error.message)) {
    return new OwnerError("Add a cover photo before publishing.", "cover")
  }
  if (error.code === "42501") {
    return new OwnerError("Only site admins can save news.")
  }
  return new OwnerError(`${what} couldn’t be saved: ${error.message}`)
}

const ownerMessage = (error: unknown, fallback: string) =>
  error instanceof OwnerError
    ? error.message
    : error instanceof Error && /no longer exists|may be deleted/.test(error.message)
      ? "This post was deleted. Reload to see the current list."
      : fallback

/** The first problem with each field, keyed by the field's name. */
function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {}
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "")
    if (field && !fields[field]) fields[field] = issue.message
  }
  return fields
}

export type NewsSaveResult =
  | { error: string; fields?: Record<string, string> }
  | {
      id: string
      slug: string
      cover: string | null
      images: string[]
      published_at: string | null
    }

/** Saves a post from the News tab's post form. */
export async function saveNewsFromEditor(
  input: unknown
): Promise<NewsSaveResult> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = newsPostInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: "Check the marked fields.",
      fields: fieldErrors(parsed.error.issues),
    }
  }
  try {
    const saved = await saveNewsPost(
      await sessionSupabase(),
      parsed.data,
      ownerFail
    )
    updateTag(NEWS_CACHE_TAG)
    return {
      id: saved.id,
      slug: saved.slug,
      cover: saved.cover,
      images: saved.images,
      published_at: saved.published_at,
    }
  } catch (error) {
    if (error instanceof OwnerError) {
      return {
        error: error.message,
        ...(error.field && { fields: { [error.field]: error.message } }),
      }
    }
    return { error: ownerMessage(error, "Couldn’t save the post. Try again.") }
  }
}

/** Saves the statuses changed in the News tab's table. */
export async function saveNewsTableEdits(
  edits: unknown
): Promise<{ error: string } | { saved: number }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = newsQuickEditsSchema.safeParse(edits)
  if (!parsed.success) return { error: "Some of these changes aren’t valid." }
  try {
    const result = await saveNewsQuickEdits(
      await sessionSupabase(),
      parsed.data,
      ownerFail
    )
    updateTag(NEWS_CACHE_TAG)
    return result
  } catch (error) {
    return {
      error: ownerMessage(error, "Couldn’t save these changes. Try again."),
    }
  }
}

/** Deletes a post after the owner confirmed it; its photos stay in storage. */
export async function deleteNewsFromAdmin(
  input: unknown
): Promise<{ error: string } | { deleted: true }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = deleteNewsPostInputSchema.safeParse(input)
  if (!parsed.success) return { error: "That post isn’t valid." }
  try {
    const slug = await deleteNewsPost(
      await sessionSupabase(),
      parsed.data.id,
      ownerFail
    )
    updateTag(NEWS_CACHE_TAG)
    return slug !== null
      ? { deleted: true }
      : { error: "This post was already deleted." }
  } catch (error) {
    return {
      error: ownerMessage(error, "Couldn’t delete the post. Try again."),
    }
  }
}
