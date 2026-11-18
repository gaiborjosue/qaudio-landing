import type { ReactNode } from "react"
import { MarkdownText } from "@/components/markdown-text"
import {
  CHANGE_FIELDS,
  CHANGE_LABELS,
  productUpdate,
  writtenFields,
  type ChangeField,
  type ProductBasis,
  type ProductUpdate,
} from "@/lib/admin/product-changes"
import { PRODUCT_AVAILABILITY_OPTIONS } from "@/lib/admin/product-editor"
import {
  productFromInput,
  type AdminProduct,
  type CatalogTaxonomy,
} from "@/lib/admin/preview"
import type {
  CreateProductInput,
  ProductChanges,
  ProductInput,
  UpdateProductsInput,
} from "@/lib/admin/schemas"
import { withConditionScore } from "@/lib/admin/condition-score"
import {
  descriptionFromColumns,
  formatPrice,
  isUsedEquipment,
} from "@/lib/catalog"
import { mediaUrl } from "@/lib/media"
import { wordDiff } from "@/lib/admin/text-diff"
import {
  ConditionBadge,
  ProductReviewTable,
  ProductThumb,
} from "./product-review-table"
import styles from "./admin.module.css"
import tableStyles from "./product-table.module.css"

// The approval cards of the agent's product changes
// (products__update_products, products__create_product), in the Products
// tab's table, with every field in its product's row. A change reads
// "before → after", and text as what was removed and added, worked out with
// the same code the save uses (lib/admin/product-changes.ts); "before" is
// the product as this page loaded it.

type Photo = { path: string; alt: string }

/** A field's value, before or after the change. */
type Values = Partial<Record<ChangeField, unknown>>

// Text shown word by word, as what was removed and added.
const TEXT: ReadonlySet<ChangeField> = new Set([
  "name",
  "condition_note",
  "short_description",
  "description",
])
// Fields that need room for a line of text or photos.
const WIDE: ReadonlySet<ChangeField> = new Set([
  "short_description",
  "description",
  "images",
])

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`

function Note({ children }: { children: ReactNode }) {
  return <p className={styles.previewNote}>{children}</p>
}

/** What a saved product has, field by field. */
function savedValues(product: AdminProduct): Values {
  return {
    name: product.name,
    slug: product.slug,
    category_slug: product.category.slug,
    brand_slug: product.brand?.slug ?? null,
    condition: product.condition,
    condition_note: product.condition_note ?? "",
    availability: product.availability ?? "available",
    price_cents: product.price_cents,
    msrp_cents: product.msrp_cents,
    price_unit: product.price_unit,
    ready_for_audition: product.ready_for_audition,
    status: product.status,
    manufacturer_url: product.manufacturer_url,
    short_description: product.short_description,
    description: product.description,
    images: product.images,
  }
}

/** What the change writes, field by field. */
function changedValues(update: ProductUpdate, changes: ProductChanges): Values {
  return {
    ...(update as Values),
    ...(update.description_intro !== undefined && {
      description: descriptionFromColumns({
        description_intro: update.description_intro,
        features: update.features ?? [],
        description_closing: update.description_closing ?? "",
      }),
    }),
    ...(changes.images && { images: changes.images }),
  }
}

const photos = (value: unknown) =>
  Array.isArray(value) ? (value as Photo[]) : []
const text = (value: unknown) => (typeof value === "string" ? value : "")

/** A field's value as the Products tab shows it. */
function shown(
  field: ChangeField,
  value: unknown,
  taxonomy: CatalogTaxonomy
): ReactNode {
  switch (field) {
    case "category_slug":
      return (
        taxonomy.categories.find((item) => item.slug === value)?.name ??
        String(value)
      )
    case "brand_slug":
      return value
        ? (taxonomy.brands.find((item) => item.slug === value)?.name ??
            String(value))
        : "No brand"
    case "condition":
      return <ConditionBadge condition={String(value)} />
    case "availability":
      return (
        PRODUCT_AVAILABILITY_OPTIONS.find((option) => option.value === value)
          ?.label ?? String(value)
      )
    case "price_cents":
      return formatPrice(typeof value === "number" ? value : null)
    case "msrp_cents":
      return typeof value === "number" ? formatPrice(value) : "—"
    case "price_unit":
      return value === "pair" ? "Pair" : "Each"
    case "ready_for_audition":
      return value ? "Yes" : "No"
    case "status":
      return value === "published" ? "Published" : "Draft"
    case "slug":
      return `/products/${value}`
    case "manufacturer_url":
      return typeof value === "string" && value
        ? value.replace(/^https:\/\//, "")
        : "—"
    case "images":
      return plural(photos(value).length, "photo")
    default:
      return text(value).trim() || "—"
  }
}

/**
 * Text as what was removed (struck through) and added (marked), or just the
 * new text for a product this page hasn't loaded. A description scrolls in
 * its cell.
 */
function TextChange({
  label,
  before,
  after,
  long,
}: {
  label: string
  before: string | null
  after: string
  long: boolean
}) {
  const parts =
    before === null
      ? [{ kind: "same" as const, text: after }]
      : wordDiff(before, after)
  const body = parts.some((part) => part.text.trim()) ? (
    parts.map((part, index) =>
      part.kind === "removed" ? (
        <del key={index} className={tableStyles.removed}>
          <span className="visually-hidden">Removed: </span>
          {part.text}
        </del>
      ) : part.kind === "added" ? (
        <ins key={index} className={tableStyles.added}>
          <span className="visually-hidden">Added: </span>
          {part.text}
        </ins>
      ) : (
        part.text
      )
    )
  ) : (
    <span className={tableStyles.was}>None</span>
  )
  return long ? (
    <div
      className={`${tableStyles.text} ${tableStyles.longText}`}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      {body}
    </div>
  ) : (
    <span className={tableStyles.text}>{body}</span>
  )
}

/** A product's photos in order, as small tiles. */
function PhotoStrip({ images, label }: { images: Photo[]; label: string }) {
  return images.length > 0 ? (
    <ol className={tableStyles.photoStrip} aria-label={label}>
      {images.map((image, index) => (
        <li key={`${index}-${image.path}`}>
          <ProductThumb src={mediaUrl(image.path)} alt={image.alt} />
        </li>
      ))}
    </ol>
  ) : (
    <span className={tableStyles.was}>No photos</span>
  )
}

/** One field's change in its cell: "—" where the product keeps it. */
function FieldChange({
  field,
  before,
  after,
  taxonomy,
}: {
  field: ChangeField
  before: Values | null
  after: Values
  taxonomy: CatalogTaxonomy
}) {
  if (!(field in after)) return <span className={tableStyles.was}>—</span>
  if (TEXT.has(field)) {
    return (
      <TextChange
        label={CHANGE_LABELS[field]}
        before={before && text(before[field])}
        after={text(after[field])}
        long={field === "description"}
      />
    )
  }
  if (field === "images") {
    const was = before && photos(before.images).length
    return (
      <span className={tableStyles.photoChange}>
        <PhotoStrip images={photos(after.images)} label="New photos" />
        {was !== null && (
          <span className={tableStyles.was}>Was {plural(was, "photo")}</span>
        )}
      </span>
    )
  }
  return (
    <span className={tableStyles.change}>
      {before && (
        <>
          <span className={tableStyles.was}>
            {shown(field, before[field], taxonomy)}
          </span>
          <span aria-hidden="true">→</span>
          <span className="visually-hidden">to</span>
        </>
      )}
      <span className={tableStyles.strong}>
        {shown(field, after[field], taxonomy)}
      </span>
    </span>
  )
}

/** One product's fields as rows: a label, then its cell. */
function FieldTable({
  label,
  heading,
  rows,
}: {
  label: string
  /** The value column's heading. */
  heading: string
  rows: { key: string; label: string; cell: ReactNode }[]
}) {
  return (
    <div className={`${tableStyles.frame} ${tableStyles.review}`}>
      <div
        className={tableStyles.scroller}
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        <table className={tableStyles.table}>
          <caption className="visually-hidden">{label}</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">{heading}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className={tableStyles.fieldName}>
                  {row.label}
                </th>
                <td>{row.cell}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const NO_BASIS: ProductBasis = {
  category_slug: "",
  condition: "",
  condition_note: "",
  availability: "available",
  status: "",
}

type Row = {
  id: string
  name: string
  product?: AdminProduct
  before: Values | null
  after: Values
  fields: ChangeField[]
  problem: string | null
}

/** A sale must stay below the new regular price; the database checks it. */
function saleProblem(product: AdminProduct | undefined, after: Values) {
  const sale = product?.sale_window
  const price = after.price_cents
  if (!sale || price === undefined) return null
  return price === null || sale.price_cents >= (price as number)
    ? `Its sale price, ${formatPrice(sale.price_cents)}, must stay below the regular price; end or change the sale first.`
    : null
}

/** products__update_products: each product's changes, before → after. */
export function ProductUpdatesPreview({
  input,
  products,
  taxonomy,
}: {
  input: UpdateProductsInput
  products: AdminProduct[]
  taxonomy: CatalogTaxonomy
}) {
  const byId = new Map(products.map((product) => [product.id, product]))
  const rows: Row[] = input.products.map(({ id, name, changes }) => {
    const product = byId.get(id)
    const basis: ProductBasis = product
      ? {
          category_slug: product.category.slug,
          condition: product.condition,
          condition_note: product.condition_note ?? "",
          availability: product.availability ?? "available",
          status: product.status,
        }
      : NO_BASIS
    const update = productUpdate(basis, changes)
    const after = changedValues(update, changes)
    return {
      id,
      name,
      product,
      before: product ? savedValues(product) : null,
      after,
      fields: writtenFields(update, changes),
      problem: saleProblem(product, after),
    }
  })
  // Every field any product changes, in the form's order.
  const fields = CHANGE_FIELDS.filter((field) =>
    rows.some((row) => row.fields.includes(field))
  )
  const unloaded = rows.filter((row) => !row.product).length
  const cell = (row: Row, field: ChangeField) => (
    <FieldChange
      field={field}
      before={row.before}
      after={row.after}
      taxonomy={taxonomy}
    />
  )

  // One product: its fields as rows, so many changes stay readable.
  if (rows.length === 1) {
    const [row] = rows
    return (
      <>
        <Note>
          {row.product?.name ?? row.name}
          {row.product?.brand && ` · ${row.product.brand.name}`}
          {unloaded > 0 && " · Not on this page yet"}
        </Note>
        {row.problem && <Note>{row.problem}</Note>}
        <FieldTable
          label="Product changes"
          heading="Change"
          rows={fields.map((field) => ({
            key: field,
            label: CHANGE_LABELS[field],
            cell: cell(row, field),
          }))}
        />
      </>
    )
  }

  return (
    <>
      <Note>
        {plural(rows.length, "product")} ·{" "}
        {fields.map((field) => CHANGE_LABELS[field]).join(", ")}
        {unloaded > 0 && ` · ${unloaded} not on this page yet`}
      </Note>
      <ProductReviewTable
        label="Product changes"
        rows={rows}
        rowKey={(row) => row.id}
        product={(row) => ({
          name: row.product?.name ?? row.name,
          photo: row.product?.images[0]?.src,
          detail: row.product?.brand?.name,
          problem: row.problem,
        })}
        columns={fields.map((field) => ({
          label: CHANGE_LABELS[field],
          wide: WIDE.has(field),
          cell: (row: Row) => cell(row, field),
        }))}
      />
    </>
  )
}

/** A proposed new product as the save writes it. */
export function productFromCreate({
  condition_score,
  ...input
}: CreateProductInput): ProductInput {
  const note = input.condition_note ?? ""
  return {
    ...input,
    condition_note:
      condition_score === undefined
        ? note
        : withConditionScore(note, condition_score),
  }
}

/** products__create_product (and older chats' save_product): every field of
 * the new product as a row, its copy and photos included. */
export function NewProductPreview({
  input,
  taxonomy,
}: {
  input: ProductInput
  taxonomy: CatalogTaxonomy
}) {
  const result = productFromInput(input, taxonomy)
  if ("problem" in result) return <Note>{result.problem}</Note>
  const { product } = result
  // Used gear that's sold is saved as a draft.
  const status =
    input.availability === "sold" &&
    isUsedEquipment(input.category_slug, input.condition)
      ? "draft"
      : input.status
  const rows: { key: string; label: string; cell: ReactNode }[] = [
    { key: "name", label: "Name", cell: product.name },
    { key: "category", label: "Category", cell: product.category.name },
    {
      key: "brand",
      label: "Brand",
      cell: product.brand?.name ?? "No brand",
    },
    {
      key: "condition",
      label: "Condition",
      cell: (
        <span className={tableStyles.change}>
          <ConditionBadge condition={product.condition} />
          {input.condition_note}
        </span>
      ),
    },
    {
      key: "price",
      label: "Selling price",
      cell: (
        <>
          {formatPrice(product.price_cents)}
          {product.price_unit === "pair" && product.price_cents !== null
            ? " /pair"
            : ""}
          {product.sale && (
            <span className={tableStyles.sale}>
              Sale · was {formatPrice(product.sale.regular_price_cents)}
            </span>
          )}
        </>
      ),
    },
    {
      key: "msrp",
      label: "List price",
      cell: shown("msrp_cents", product.msrp_cents, taxonomy),
    },
    {
      key: "audition",
      label: "Audition",
      cell: shown("ready_for_audition", product.ready_for_audition, taxonomy),
    },
    {
      key: "status",
      label: "Status",
      cell: (
        <>
          {shown("status", status, taxonomy)}
          {input.availability && input.availability !== "available" && (
            <span className={tableStyles.sale}>
              {shown("availability", input.availability, taxonomy)}
            </span>
          )}
        </>
      ),
    },
    {
      key: "page",
      label: "Manufacturer page",
      cell: shown("manufacturer_url", input.manufacturer_url, taxonomy),
    },
    {
      key: "card",
      label: "Card line",
      cell: shown("short_description", input.short_description, taxonomy),
    },
    {
      key: "description",
      label: "Description",
      cell: input.description.trim() ? (
        <div
          className={tableStyles.longText}
          role="region"
          aria-label="Description"
          tabIndex={0}
        >
          <MarkdownText text={input.description} />
        </div>
      ) : (
        <span className={tableStyles.was}>None</span>
      ),
    },
    {
      key: "photos",
      label: "Photos",
      cell: <PhotoStrip images={input.images} label="Photos" />,
    },
  ]
  return (
    <>
      <Note>
        /products/{input.slug} ·{" "}
        {status === "published"
          ? "Published in the shop"
          : "Draft, hidden from the shop"}
      </Note>
      <FieldTable label="New product" heading="Value" rows={rows} />
    </>
  )
}
