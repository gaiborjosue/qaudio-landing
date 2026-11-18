import type { ReactNode } from "react"
import { MarkdownText } from "@/components/markdown-text"
import {
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
import {
  ConditionBadge,
  ProductReviewTable,
  ProductThumb,
  type ReviewColumn,
} from "./product-review-table"
import styles from "./admin.module.css"
import tableStyles from "./product-table.module.css"

// The approval cards of the agent's product changes
// (products__update_products, products__create_product), in the Products
// tab's table. Each change reads "before → after", worked out with the same
// code the save uses (lib/admin/product-changes.ts); "before" is the
// product as this page loaded it.

type Photo = { path: string; alt: string }

/** A field's value, before or after the change. */
type Values = Partial<Record<ChangeField, unknown>>

// Copy and photos get a section of their own under the table.
const LONG: ReadonlySet<ChangeField> = new Set([
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
    case "description":
      return value ? "New text" : "None"
    default:
      return typeof value === "string" && value.trim() ? value : "—"
  }
}

/** "Before → after", or just "after" for a product this page hasn't loaded. */
function Change({
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
    <p className={tableStyles.was}>No photos</p>
  )
}

/** A product's new card line, description, or photos. */
function Copy({
  name,
  after,
  fields,
}: {
  name?: string
  after: Values
  fields: ChangeField[]
}) {
  const long = fields.filter((field) => LONG.has(field))
  if (long.length === 0) return null
  return (
    <section className={tableStyles.copy} aria-label={name}>
      {name && <p className={styles.newsPreviewLabel}>{name}</p>}
      {long.includes("images") && (
        <PhotoStrip images={photos(after.images)} label="Photos" />
      )}
      {long.includes("short_description") && (
        <p className={tableStyles.cardLine}>
          {String(after.short_description ?? "")}
        </p>
      )}
      {long.includes("description") && (
        <div className={styles.newsArticlePreview} tabIndex={0}>
          {String(after.description ?? "").trim() ? (
            <MarkdownText text={String(after.description)} />
          ) : (
            <p className={tableStyles.was}>No description</p>
          )}
        </div>
      )}
    </section>
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
  const fields = [
    ...new Set(rows.flatMap((row) => row.fields).filter((f) => !LONG.has(f))),
  ]
  const long = rows.filter((row) => row.fields.some((f) => LONG.has(f)))
  const summary = [...new Set(rows.flatMap((row) => row.fields))].map(
    (field) => CHANGE_LABELS[field]
  )
  const unloaded = rows.filter((row) => !row.product).length

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
        {fields.length > 0 && (
          <div className={`${tableStyles.frame} ${tableStyles.review}`}>
            <div className={tableStyles.scroller}>
              <table className={tableStyles.table}>
                <caption className="visually-hidden">Product changes</caption>
                <thead>
                  <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((field) => (
                    <tr key={field}>
                      <th scope="row" className={tableStyles.fieldName}>
                        {CHANGE_LABELS[field]}
                      </th>
                      <td>
                        <Change
                          field={field}
                          before={row.before}
                          after={row.after}
                          taxonomy={taxonomy}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <Copy after={row.after} fields={row.fields} />
      </>
    )
  }

  const columns: ReviewColumn<Row>[] = fields.map((field) => ({
    label: CHANGE_LABELS[field],
    cell: (row) => (
      <Change
        field={field}
        before={row.before}
        after={row.after}
        taxonomy={taxonomy}
      />
    ),
  }))
  // Copy changes show as a mark in the table, then in full below it.
  if (long.length > 0) {
    columns.push({
      label: "Copy and photos",
      cell: (row) =>
        row.fields
          .filter((field) => LONG.has(field))
          .map((field) => CHANGE_LABELS[field])
          .join(", ") || "—",
    })
  }
  return (
    <>
      <Note>
        {plural(rows.length, "product")} · {summary.join(", ")}
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
        columns={columns}
      />
      {long.map((row) => (
        <Copy
          key={row.id}
          name={row.product?.name ?? row.name}
          after={row.after}
          fields={row.fields}
        />
      ))}
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

/** products__create_product (and older chats' save_product): the product's
 * row as the Products tab lists it, its card line, photos, and description. */
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
  return (
    <>
      <Note>
        /products/{input.slug} ·{" "}
        {status === "published"
          ? "Published in the shop"
          : "Draft, hidden from the shop"}
      </Note>
      <ProductReviewTable
        label="Product"
        rows={[product]}
        rowKey={(row) => row.id}
        product={(row) => ({
          name: row.name,
          photo: row.images[0]?.src,
          detail: row.brand?.name,
        })}
        columns={[
          { label: "Category", cell: (row) => row.category.name },
          {
            label: "Condition",
            cell: (row) => (
              <>
                <ConditionBadge condition={row.condition} />
                {input.condition_note && (
                  <span className={tableStyles.sale}>
                    {input.condition_note}
                  </span>
                )}
              </>
            ),
          },
          {
            label: "Price",
            numeric: true,
            cell: (row) => (
              <>
                {formatPrice(row.price_cents)}
                {row.price_unit === "pair" && row.price_cents !== null
                  ? " /pair"
                  : ""}
                {row.sale && (
                  <span className={tableStyles.sale}>
                    Sale · was {formatPrice(row.sale.regular_price_cents)}
                  </span>
                )}
              </>
            ),
          },
          {
            label: "MSRP",
            numeric: true,
            cell: (row) =>
              row.msrp_cents === null ? "—" : formatPrice(row.msrp_cents),
          },
          {
            label: "Audition",
            cell: (row) => (row.ready_for_audition ? "Yes" : "No"),
          },
          {
            label: "Status",
            cell: () => (
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
        ]}
      />
      <Copy
        after={{
          images: input.images,
          short_description: input.short_description,
          description: input.description,
        }}
        fields={[
          "images",
          ...(input.short_description.trim()
            ? (["short_description"] as const)
            : []),
          "description",
        ]}
      />
    </>
  )
}
