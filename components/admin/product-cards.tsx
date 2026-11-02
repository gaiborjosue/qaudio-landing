"use client"

import { useState } from "react"
import Image from "next/image"
import type { EveToolPart, UseEveAgentReturn } from "eve/react"
import type { PreviewData } from "@/components/admin/change-preview"
import {
  ProductEditor,
  type SavedProduct,
} from "@/components/admin/product-editor"
import {
  inputFromValues,
  valuesFrom,
  valuesFromProduct,
  type ProductValues,
} from "@/lib/admin/product-editor"
import { ProductTable } from "@/components/admin/product-table"
import type { AdminProduct } from "@/lib/admin/preview"
import {
  openedProductSchema,
  openProductTableInputSchema,
  type ProductInput,
  type ProductQuickEdit,
} from "@/lib/admin/schemas"
import { formatPrice } from "@/lib/catalog"
import { mediaUrl } from "@/lib/media"
import adminStyles from "./admin.module.css"
import styles from "./product-editor.module.css"

type Agent = UseEveAgentReturn

/** The product the editor opened with, from products__open_editor's output. */
function openedValues(part: EveToolPart) {
  const output = part.output as { product?: unknown } | undefined
  const parsed = openedProductSchema.safeParse(output?.product)
  return valuesFrom(parsed.success ? parsed.data : {})
}

/**
 * Tells the agent the owner saved a product from an editor, as their own
 * message. The hidden "Product saved:" line names the card (`call`), so the
 * chat can show that card as saved after a reload too.
 */
export function announceSave(
  agent: Agent,
  call: string,
  saved: SavedProduct,
  input: ProductInput
) {
  const words = input.id
    ? `I saved my changes to “${input.name}”.`
    : input.status === "published"
      ? `I added “${input.name}” to the shop.`
      : `I added “${input.name}” as a draft.`
  void agent.send(
    `${words}\nProduct saved: ${JSON.stringify({
      call,
      id: saved.id,
      slug: saved.slug,
      status: input.status,
    })}`
  )
}

/**
 * "Draft with Tune": the editor's current values go to the agent on a
 * hidden "Editor:" line, with photos that still need a description attached
 * so it can see them. The agent drafts the copy and opens a fresh editor
 * with everything filled in; this one then shows as replaced.
 */
export function askForDraft(agent: Agent, call: string, values: ProductValues) {
  // Photos go as they are (an empty description means "write one").
  const { id, ...fields } = inputFromValues({ ...values, images: [] })
  const filled = Object.fromEntries(
    Object.entries(fields).filter(
      ([, value]) =>
        value !== "" &&
        value !== null &&
        !(Array.isArray(value) && value.length === 0) &&
        !Number.isNaN(value)
    )
  )
  const photos = values.images
  const text = `Draft the copy for this product.\nEditor: ${JSON.stringify({
    call,
    ...(id && { id }),
    draft: { ...filled, ...(photos.length > 0 && { images: photos }) },
  })}`
  const unseen = photos.filter((photo) => !photo.alt.trim())
  void agent.send(
    unseen.length === 0
      ? text
      : [
          { type: "text" as const, text },
          ...unseen.map((photo) => ({
            type: "file" as const,
            data: mediaUrl(photo.path),
            mediaType: photo.path.endsWith(".webp")
              ? "image/webp"
              : "image/jpeg",
            filename: photo.path.split("/").pop(),
          })),
        ]
  )
}

/** A saved product in one line: photo, name, and how it shows. */
function SavedSummary({
  name,
  photo,
  meta,
  url,
  onEdit,
}: {
  name: string
  photo?: string
  meta: string
  url: string | null
  onEdit: () => void
}) {
  return (
    <div className={styles.saved}>
      {photo ? (
        <Image src={photo} alt="" width={48} height={48} sizes="48px" />
      ) : (
        <span className={styles.savedPhoto} />
      )}
      <span className={styles.savedText}>
        <span className={styles.savedName}>{name}</span>
        <span className={adminStyles.hint}>{meta}</span>
      </span>
      {url && (
        <a
          className={adminStyles.link}
          href={url}
          target="_blank"
          rel="noreferrer"
        >
          View on the site
          <span className="visually-hidden"> (opens in a new tab)</span>
        </a>
      )}
      <button type="button" className={adminStyles.secondary} onClick={onEdit}>
        Edit
      </button>
    </div>
  )
}

/**
 * products__open_editor's card: the product editor, live until the owner
 * saves it (then a one-line summary they can reopen) or a newer editor for
 * the same product replaces it.
 */
export function ProductEditorCard({
  part,
  agent,
  preview,
  saved,
  replaced,
}: {
  part: EveToolPart
  agent: Agent
  preview: PreviewData
  /** The product id a "Product saved:" message recorded for this card. */
  saved?: string
  replaced: boolean
}) {
  const [opened] = useState(() => openedValues(part))
  const [savedHere, setSavedHere] = useState<{
    saved: SavedProduct
    input: ProductInput
  } | null>(null)
  const [editing, setEditing] = useState(false)
  const savedId = savedHere?.saved.id ?? saved
  const product = savedId
    ? preview.products.find((item) => item.id === savedId)
    : undefined
  const title = opened.id ? `Edit ${opened.name || "product"}` : "New product"

  const onSaved = (result: SavedProduct, input: ProductInput) => {
    setSavedHere({ saved: result, input })
    setEditing(false)
    announceSave(agent, part.callId, result, input)
  }

  let body
  let status: string | null = null
  if (savedId && !editing) {
    status = "Saved"
    const name = product?.name ?? savedHere?.input.name ?? opened.name
    const state = product?.status ?? savedHere?.input.status
    const slug = product?.slug ?? savedHere?.saved.slug
    const price = product?.price_cents ?? savedHere?.input.price_cents
    const photo =
      product?.images[0]?.src ??
      (savedHere?.saved.images[0] && mediaUrl(savedHere.saved.images[0]))
    body = (
      <SavedSummary
        name={name}
        photo={photo}
        meta={[
          price && formatPrice(price),
          state === "published" ? "In the shop" : "Draft, hidden from the shop",
        ]
          .filter(Boolean)
          .join(" · ")}
        url={state === "published" && slug ? `/products/${slug}` : null}
        onEdit={() => setEditing(true)}
      />
    )
  } else if (replaced && !savedId) {
    status = "Replaced"
    body = <p className={adminStyles.hint}>Continued in the editor below.</p>
  } else {
    const initial = savedId
      ? product
        ? valuesFromProduct(product)
        : savedHere
          ? valuesFrom({ ...savedHere.input, id: savedHere.saved.id })
          : opened
      : opened
    body = (
      <ProductEditor
        key={savedId ?? "new"}
        initial={initial}
        taxonomy={preview.taxonomy}
        storageKey={`qaudio:product-editor:${part.callId}:${savedId ?? "new"}`}
        disabled={agent.status === "resuming"}
        onSaved={onSaved}
        onDraft={(values) => askForDraft(agent, part.callId, values)}
        onCancel={savedId ? () => setEditing(false) : undefined}
      />
    )
  }

  return (
    <section className={adminStyles.card} aria-label={title}>
      <header className={adminStyles.cardHeader}>
        <h2>{title}</h2>
        {status && <span className={adminStyles.status}>{status}</span>}
      </header>
      {body}
    </section>
  )
}

/** Tells the agent which products the owner changed in the table. */
function announceTableEdits(
  agent: Agent,
  edits: ProductQuickEdit[],
  names: string[]
) {
  const words =
    edits.length === 1
      ? `I updated “${names[0]}” in the product table.`
      : `I updated ${edits.length} products in the product table.`
  void agent.send(
    `${words}\nProducts updated: ${JSON.stringify(
      edits.map((edit, index) => ({ ...edit, name: names[index] }))
    )}`
  )
}

/**
 * products__open_table's card: every product in a table the owner filters,
 * pages through, and edits in place. A row (or Add product) opens the full
 * editor in the same card; the table stays mounted underneath, so its
 * filters, page, and unsaved changes are there on the way back.
 */
export function ProductTableCard({
  part,
  agent,
  preview,
}: {
  part: EveToolPart
  agent: Agent
  preview: PreviewData
}) {
  const [filters] = useState(() => {
    const output = part.output as { filters?: unknown } | undefined
    const parsed = openProductTableInputSchema.safeParse(output?.filters)
    return parsed.success ? parsed.data : {}
  })
  const [open, setOpen] = useState<AdminProduct | "new" | null>(null)
  const disabled = agent.status === "resuming"
  const title =
    open === "new" ? "New product" : open ? `Edit ${open.name}` : "Products"

  return (
    <section className={adminStyles.card} aria-label={title}>
      <header className={adminStyles.cardHeader}>
        <h2>{title}</h2>
      </header>
      <div hidden={open !== null}>
        <ProductTable
          products={preview.products}
          taxonomy={preview.taxonomy}
          initialFilters={filters}
          disabled={disabled}
          onOpen={(product) => setOpen(product ?? "new")}
          onSaved={(edits, names) => announceTableEdits(agent, edits, names)}
        />
      </div>
      {open !== null && (
        <ProductEditor
          key={open === "new" ? "new" : open.id}
          initial={open === "new" ? valuesFrom() : valuesFromProduct(open)}
          taxonomy={preview.taxonomy}
          storageKey={`qaudio:product-table:${part.callId}:${
            open === "new" ? "new" : open.id
          }`}
          disabled={disabled}
          onSaved={(saved, input) => {
            announceSave(agent, part.callId, saved, input)
            setOpen(null)
          }}
          onDraft={(values) => askForDraft(agent, part.callId, values)}
          onCancel={() => setOpen(null)}
        />
      )}
    </section>
  )
}
