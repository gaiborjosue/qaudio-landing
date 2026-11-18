"use server"

import { updateTag } from "next/cache"
import { getAdmin } from "@/lib/admin/auth"
import { deleteDeal, saveDeal, saveDealQuickEdits } from "@/lib/admin/deal-save"
import {
  dealFieldsSchema,
  dealInputSchema,
  dealQuickEditsSchema,
  deleteDealInputSchema,
} from "@/lib/admin/schemas"
import { DEALS_CACHE_TAG } from "@/lib/deals-data"
import { sessionSupabase } from "@/lib/supabase/server"

// The Deals tab's direct edits, saved as the signed-in admin (RLS). Pressing
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
  if (error.code === "23514" && /deals_window/.test(error.message)) {
    return new OwnerError("The end must be after the start.", "ends_at")
  }
  if (error.code === "23503") {
    return new OwnerError(
      "A linked product no longer exists. Pick another or unlink it.",
      "items"
    )
  }
  if (error.code === "42501") {
    return new OwnerError("Only site admins can save deals.")
  }
  if (/^Photo/.test(what)) {
    return new OwnerError("The image couldn’t be saved. Try again.", "image")
  }
  return new OwnerError(`${what} couldn’t be saved: ${error.message}`)
}

const ownerMessage = (error: unknown, fallback: string) =>
  error instanceof OwnerError
    ? error.message
    : error instanceof Error && /no deal with that id/.test(error.message)
      ? "This deal was deleted. Reload to see the current list."
      : fallback

/** The first problem with each field, keyed by the field's name. */
function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {}
  for (const issue of issues) {
    // The dates' order is checked on the whole deal.
    const field = String(issue.path[0] ?? "ends_at")
    if (!fields[field]) fields[field] = issue.message
  }
  return fields
}

export type DealSaveResult =
  | { error: string; fields?: Record<string, string> }
  | { id: string; image: { path: string } | null }

/**
 * Saves a deal from the Deals tab's form. For a saved deal, `fields` names
 * the ones the owner changed, and only those are written, so changes made
 * elsewhere since the form opened (by Tune, say) stay.
 */
export async function saveDealFromEditor(
  input: unknown,
  fields?: unknown
): Promise<DealSaveResult> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = dealInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: "Check the marked fields.",
      fields: fieldErrors(parsed.error.issues),
    }
  }
  const changed =
    fields === undefined ? null : dealFieldsSchema.safeParse(fields)
  if (changed && !changed.success) {
    return { error: "Couldn’t save the deal. Try again." }
  }
  try {
    const saved = await saveDeal(
      await sessionSupabase(),
      parsed.data,
      ownerFail,
      changed ? new Set<string>(changed.data) : undefined
    )
    updateTag(DEALS_CACHE_TAG)
    return { id: saved.id, image: saved.image }
  } catch (error) {
    if (error instanceof OwnerError) {
      return {
        error: error.message,
        ...(error.field && { fields: { [error.field]: error.message } }),
      }
    }
    return { error: ownerMessage(error, "Couldn’t save the deal. Try again.") }
  }
}

/** Saves the statuses changed in the Deals tab's table. */
export async function saveDealTableEdits(
  edits: unknown
): Promise<{ error: string } | { saved: number }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = dealQuickEditsSchema.safeParse(edits)
  if (!parsed.success) return { error: "Some of these changes aren’t valid." }
  try {
    const result = await saveDealQuickEdits(
      await sessionSupabase(),
      parsed.data,
      ownerFail
    )
    updateTag(DEALS_CACHE_TAG)
    return result
  } catch (error) {
    return {
      error: ownerMessage(error, "Couldn’t save these changes. Try again."),
    }
  }
}

/** Deletes a deal from the Deals tab, after the owner confirmed it. */
export async function deleteDealFromAdmin(
  input: unknown
): Promise<{ error: string } | { deleted: true }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = deleteDealInputSchema.safeParse(input)
  if (!parsed.success) return { error: "That deal isn’t valid." }
  try {
    const deleted = await deleteDeal(
      await sessionSupabase(),
      parsed.data.id,
      ownerFail
    )
    updateTag(DEALS_CACHE_TAG)
    return deleted
      ? { deleted: true }
      : { error: "This deal was already deleted." }
  } catch (error) {
    return {
      error: ownerMessage(error, "Couldn’t delete the deal. Try again."),
    }
  }
}
