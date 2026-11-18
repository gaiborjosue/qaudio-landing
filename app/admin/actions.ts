"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { NEWS_CACHE_TAG } from "@/lib/news-data"
import { updateTag } from "next/cache"
import { getAdmin } from "@/lib/admin/auth"
import {
  ProductOrderMismatch,
  saveProductOrder,
} from "@/lib/admin/product-order"
import {
  deleteProduct,
  saveProduct,
  saveProductQuickEdits,
} from "@/lib/admin/product-save"
import {
  deleteProductInputSchema,
  productCardLineInputSchema,
  productFieldsSchema,
  productInputSchema,
  productQuickEditsSchema,
  reorderProductsInputSchema,
} from "@/lib/admin/schemas"
import { writeCardLine } from "@/lib/admin/card-line"
import { CATALOG_CACHE_TAG, getCatalogTaxonomy } from "@/lib/catalog-data"
import { siteCacheTags } from "@/lib/admin/site-cache"
import { sessionSupabase } from "@/lib/supabase/server"

export type FormState = { error: string } | { message: string } | null

export async function signIn(
  _previous: FormState,
  form: FormData
): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim()
  const password = String(form.get("password") ?? "")
  if (!email || !password || email.length > 320 || password.length > 200) {
    return { error: "Enter your email and password." }
  }
  const supabase = await sessionSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: "That email and password don’t match." }
  const { data: isAdmin } = await supabase.rpc("is_admin")
  if (isAdmin !== true) {
    await supabase.auth.signOut()
    return { error: "This account can’t manage the site." }
  }
  redirect("/admin")
}

/**
 * Emails a password reset link. The link returns through /auth/confirm (PKCE:
 * open it in the browser that asked for it) to /admin/set-password. The reply
 * is the same whether or not the account exists.
 */
export async function requestPasswordReset(
  _previous: FormState,
  form: FormData
): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim()
  if (!email || email.length > 320) return { error: "Enter your email." }
  const origin = (await headers()).get("origin")
  if (!origin) return { error: "Couldn’t send the link. Try again." }
  const supabase = await sessionSupabase()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/admin/set-password`,
  })
  if (error?.status === 429) {
    return {
      error: "Too many emails were sent. Wait a few minutes and try again.",
    }
  }
  return {
    message:
      "If that address has an account, a reset link is on its way. Open it in this browser.",
  }
}

/** Sets a new password for the signed-in user (after a reset or invite link). */
export async function setPassword(
  _previous: FormState,
  form: FormData
): Promise<FormState> {
  const password = String(form.get("password") ?? "")
  const confirm = String(form.get("confirm") ?? "")
  if (password.length < 10 || password.length > 72) {
    return { error: "Use 10 to 72 characters." }
  }
  if (password !== confirm) return { error: "The passwords don’t match." }
  const supabase = await sessionSupabase()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) redirect("/admin/login")
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  const { data: isAdmin } = await supabase.rpc("is_admin")
  if (isAdmin !== true) {
    await supabase.auth.signOut()
    return { error: "Password saved, but this account can’t manage the site." }
  }
  redirect("/admin")
}

export async function signOut() {
  const supabase = await sessionSupabase()
  await supabase.auth.signOut()
  redirect("/admin/login")
}

/**
 * Refreshes the chat's previews after live or replayed saves. Agent writes
 * also notify /api/admin/revalidate without depending on an open browser.
 */
export async function refreshSiteContent(tags: string[]) {
  if (!(await getAdmin())) throw new Error("Sign in as an admin.")
  for (const tag of siteCacheTags(tags)) updateTag(tag)
}

/**
 * Saves a product order the owner arranged by hand on a reorder card, as the
 * signed-in admin (RLS). Arranging it and pressing Save is the owner's
 * approval, so it doesn't go back to the agent for another one.
 */
export async function saveArrangedOrder(
  input: unknown
): Promise<{ error: string } | { changed: number }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = reorderProductsInputSchema.safeParse(input)
  if (!parsed.success) return { error: "That order isn’t valid." }
  try {
    const { changed } = await saveProductOrder(
      await sessionSupabase(),
      parsed.data,
      (what, error) => new Error(`${what}: ${error.message}`)
    )
    updateTag(CATALOG_CACHE_TAG)
    return { changed }
  } catch (error) {
    if (error instanceof ProductOrderMismatch) {
      return {
        error:
          "These products changed since the list was made. Ask Tune for a fresh one.",
      }
    }
    return { error: "Couldn’t save the order. Try again." }
  }
}

/** A save the owner can act on: why it failed, field by field if it can. */
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
    return new OwnerError("Another product already uses this address.", "slug")
  }
  if (error.code === "23503") {
    return new OwnerError("Pick a category and a brand from the lists.")
  }
  if (error.code === "42501") {
    return new OwnerError("Only site admins can save products.")
  }
  if (error.code === "23514" && /sale/.test(error.message)) {
    return new OwnerError(
      "A sale must cost less than the regular price and end after it starts. Change or remove the sale first.",
      "sale"
    )
  }
  return new OwnerError(`${what} couldn’t be saved: ${error.message}`)
}

/** The first problem with each field, keyed by the field's name. */
function fieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {}
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "")
    if (field && !fields[field]) fields[field] = issue.message
  }
  return fields
}

export type ProductSaveResult =
  | { error: string; fields?: Record<string, string> }
  | { id: string; slug: string; images: string[]; short_description: string }

/** Draft a card line for review in the form; this does not save the product. */
export async function generateProductCardLine(
  input: unknown
): Promise<{ error: string } | { short_description: string }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = productCardLineInputSchema.safeParse(input)
  if (!parsed.success) return { error: "Add a valid description first." }
  const product = parsed.data
  try {
    const { categories, brands } = await getCatalogTaxonomy()
    const line = await writeCardLine({
      name: product.name ?? "",
      brand:
        brands.find((brand) => brand.slug === product.brand_slug)?.name ?? "",
      category:
        categories.find((category) => category.slug === product.category_slug)
          ?.name ?? "",
      condition: product.condition,
      description: product.description,
    })
    return line
      ? { short_description: line }
      : { error: "Add some description text first." }
  } catch {
    return { error: "Couldn’t write the card line. Try again." }
  }
}

/**
 * Saves a product from the Products tab's product form, as the signed-in
 * admin (RLS). The owner filled it in and pressed Save, which is their
 * approval. For a saved product, `fields` names the ones the owner changed,
 * and only those are written, so changes made elsewhere since the form
 * opened stay. A missing card line is written first, from the description,
 * by the fast copywriting model.
 */
export async function saveProductFromEditor(
  input: unknown,
  fields?: unknown
): Promise<ProductSaveResult> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = productInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      error: "Check the marked fields.",
      fields: fieldErrors(parsed.error.issues),
    }
  }
  const changed =
    fields === undefined ? null : productFieldsSchema.safeParse(fields)
  if (changed && !changed.success) {
    return { error: "Couldn’t save the product. Try again." }
  }
  const only = changed ? new Set<string>(changed.data) : undefined
  const product = parsed.data
  if (!product.short_description.trim()) {
    only?.add("short_description")
    const { categories, brands } = await getCatalogTaxonomy()
    product.short_description = await writeCardLine({
      name: product.name,
      brand:
        brands.find((brand) => brand.slug === product.brand_slug)?.name ?? "",
      category:
        categories.find((category) => category.slug === product.category_slug)
          ?.name ?? "",
      condition: product.condition,
      description: product.description,
    })
  }
  try {
    const saved = await saveProduct(
      await sessionSupabase(),
      product,
      ownerFail,
      only
    )
    updateTag(CATALOG_CACHE_TAG)
    updateTag(NEWS_CACHE_TAG)
    return { ...saved, short_description: product.short_description }
  } catch (error) {
    if (error instanceof OwnerError) {
      return {
        error: error.message,
        ...(error.field && { fields: { [error.field]: error.message } }),
      }
    }
    return { error: "Couldn’t save the product. Try again." }
  }
}

/**
 * Saves the short fields changed in the Products tab's table (price,
 * condition, audition, status), as the signed-in admin (RLS).
 */
export async function saveProductTableEdits(
  edits: unknown
): Promise<{ error: string } | { saved: number }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = productQuickEditsSchema.safeParse(edits)
  if (!parsed.success) return { error: "Some of these changes aren’t valid." }
  try {
    const result = await saveProductQuickEdits(
      await sessionSupabase(),
      parsed.data,
      ownerFail
    )
    updateTag(CATALOG_CACHE_TAG)
    updateTag(NEWS_CACHE_TAG)
    return result
  } catch (error) {
    return {
      error:
        error instanceof OwnerError
          ? error.message
          : "Couldn’t save these changes. Try again.",
    }
  }
}

/**
 * Deletes a product from the Products tab, as the signed-in admin (RLS),
 * after the owner confirmed it. Its photo files stay in storage.
 */
export async function deleteProductFromAdmin(
  input: unknown
): Promise<{ error: string } | { deleted: true }> {
  if (!(await getAdmin())) return { error: "Sign in as an admin." }
  const parsed = deleteProductInputSchema.safeParse(input)
  if (!parsed.success) return { error: "That product isn’t valid." }
  try {
    const deleted = await deleteProduct(
      await sessionSupabase(),
      parsed.data.id,
      ownerFail
    )
    updateTag(CATALOG_CACHE_TAG)
    updateTag(NEWS_CACHE_TAG)
    return deleted
      ? { deleted: true }
      : { error: "This product was already deleted." }
  } catch (error) {
    return {
      error:
        error instanceof OwnerError
          ? error.message
          : "Couldn’t delete the product. Try again.",
    }
  }
}
