import { z } from "zod"

export const metadataKind = z.enum(["categories", "brands"])
export type MetadataKind = z.infer<typeof metadataKind>
export type MetadataRow = {
  slug: string
  name: string
  sort_order: number
  wheel_label?: string
  artwork_path?: string
  scene_path?: string
  logo_path?: string
}
export type MetadataData = Record<MetadataKind, MetadataRow[]>
export class MetadataSaveError extends Error {}

const slug = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/)
const file = "[a-zA-Z0-9][a-zA-Z0-9._-]*"
export const assetPath = (folder: string) =>
  z
    .string()
    .max(300)
    .regex(
      new RegExp(
        `^(?:/${folder}/${file}|${folder}/[0-9a-f-]{36}\\.webp|uploads/[0-9a-f-]{36}\\.webp)$`
      ),
      "Choose an image."
    )
const base = {
  slug,
  original_slug: slug.optional(),
  name: z.string().trim().min(1).max(120),
}
export const metadataInput = z
  .discriminatedUnion("kind", [
    z.object({
      ...base,
      kind: z.literal("categories"),
      wheel_label: z.string().trim().min(1).max(40),
      artwork_path: assetPath("categories"),
      scene_path: assetPath("category-scenes"),
    }),
    z.object({
      ...base,
      kind: z.literal("brands"),
      logo_path: assetPath("brands"),
    }),
  ])
  .refine(
    (value) => !value.original_slug || value.original_slug === value.slug,
    { message: "Addresses cannot change after creation.", path: ["slug"] }
  )
export type MetadataInput = z.infer<typeof metadataInput>
export const metadataDelete = z.object({ kind: metadataKind, slug })
export const metadataOrder = z
  .object({
    kind: metadataKind,
    expected: z.array(slug).max(500),
    ordered: z.array(slug).max(500),
  })
  .refine(
    ({ expected, ordered }) =>
      expected.length === ordered.length &&
      new Set(ordered).size === ordered.length &&
      expected.every((item) => ordered.includes(item)),
    "The order must include every entry once."
  )

/** Encoded request body; stays below Vercel's 4.5 MB function limit. */
export const METADATA_IMAGE_MAX = 4 * 1024 * 1024
export const METADATA_SOURCE_MAX = 20e6
export const metadataImageKind = z.enum(["icon", "scene", "logo"])
export type MetadataImageKind = z.infer<typeof metadataImageKind>

/** Owner-facing database errors; never expose SQL or provider messages. */
export function metadataError(error: { code?: string; message?: string }) {
  if (error.code === "23505") return "That address is already in use."
  if (error.code === "23503")
    return "Products still use this entry. Reassign them in Products first."
  if (error.code === "23514")
    return "This address is fixed, and Used Equipment cannot be deleted."
  if (error.code === "40001")
    return "The list changed. Reload it before saving this order."
  if (error.code === "42501") return "Sign in as an admin."
  return "Couldn’t save this change. Try again."
}
