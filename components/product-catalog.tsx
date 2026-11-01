"use client"

// Adapted from Aceternity's expandable-card-demo-standard registry source:
// https://ui.aceternity.com/components/expandable-card
// Retains shared card/image/title/description layout IDs and AnimatePresence.
// Adds native modal semantics, nested gallery, focus return, and reduced motion.
import {
  useEffect,
  useEffectEvent,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  MotionConfig,
  useReducedMotion,
} from "motion/react"
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Headphones,
  X,
} from "lucide-react"
import {
  formatPrice,
  isProductOnSale,
  PRODUCT_PATH,
  productHref,
  type Product,
  type ProductImage,
} from "@/lib/catalog"
import styles from "./product-catalog.module.css"

const CONDITION_TONES = ["new", "demo", "used"]

function conditionTone(condition: string) {
  const key = condition.trim().toLowerCase()
  return CONDITION_TONES.includes(key) ? key : "other"
}

/** The same selling-price label on cards, details, and admin previews. */
function ProductPrice({
  product,
  detail = false,
}: {
  product: Product
  detail?: boolean
}) {
  const onSale = isProductOnSale(product)
  const label = onSale
    ? "Sale price · "
    : product.price_cents === product.msrp_cents
      ? "MSRP · "
      : ""
  return (
    <p className={detail ? styles.detailPrice : undefined}>
      {formatPrice(product.price_cents)}
      <span>
        {label}USD / {product.price_unit}
      </span>
      {!detail && onSale && product.msrp_cents !== null && (
        <span>
          MSRP <s>{formatPrice(product.msrp_cents)}</s>
        </span>
      )}
    </p>
  )
}

// A left click without modifier keys opens the details in place; anything
// else (new tab, new window) follows the link to the full product page.
const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

function trackGlassPointer(event: PointerEvent<HTMLElement>) {
  if (event.pointerType !== "mouse") return
  const bounds = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty(
    "--glass-x",
    `${((event.clientX - bounds.left) / bounds.width) * 100}%`
  )
  event.currentTarget.style.setProperty(
    "--glass-y",
    `${((event.clientY - bounds.top) / bounds.height) * 100}%`
  )
}

function Photo({
  image,
  sizes,
  eager = false,
}: {
  image: ProductImage
  sizes: string
  eager?: boolean
}) {
  return (
    <Image
      src={image.src}
      alt={image.alt}
      width={image.width}
      height={image.height}
      sizes={sizes}
      loading={eager ? "eager" : "lazy"}
    />
  )
}

function ProductGallery({
  product,
  initialIndex,
  onClose,
}: {
  product: Product
  initialIndex: number
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [index, setIndex] = useState(initialIndex)
  const titleId = useId()
  const current = product.images[index]
  const move = (step: number) =>
    setIndex(
      (value) => (value + step + product.images.length) % product.images.length
    )

  useEffect(() => {
    const node = dialog.current
    node?.showModal()
    return () => {
      node?.close()
    }
  }, [])

  return (
    <dialog
      ref={dialog}
      className={styles.galleryDialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault()
          event.stopPropagation()
          move(event.key === "ArrowRight" ? 1 : -1)
        }
      }}
    >
      <div className={styles.galleryTop}>
        <h2 id={titleId}>{product.name}</h2>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Close gallery"
          onClick={onClose}
          autoFocus
        >
          <X size={20} />
        </button>
      </div>
      <div className={styles.galleryStage}>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Previous photo"
          onClick={() => move(-1)}
        >
          <ArrowLeft size={22} />
        </button>
        <div className={styles.galleryPhoto}>
          <Photo image={current} eager sizes="(max-width: 700px) 90vw, 80vw" />
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Next photo"
          onClick={() => move(1)}
        >
          <ArrowRight size={22} />
        </button>
      </div>
      <p
        className={styles.galleryCaption}
        aria-live="polite"
        aria-atomic="true"
      >
        {index + 1} / {product.images.length} — {current.alt}
      </p>
      <div className={styles.thumbnails} aria-label="Gallery photos">
        {product.images.map((image, i) => (
          <button
            type="button"
            key={image.id}
            aria-label={`Show photo ${i + 1}: ${image.alt}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => setIndex(i)}
          >
            <Photo image={image} sizes="80px" />
          </button>
        ))}
      </div>
    </dialog>
  )
}

function ProductDetails({
  product,
  layoutId,
  close,
}: {
  product: Product
  layoutId: (part: string) => string | undefined
  /** In the dialog; without it the details render as a standalone page. */
  close?: () => void
}) {
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const galleryTrigger = useRef<HTMLButtonElement | null>(null)
  const titleId = `product-title-${product.id}`
  const atMsrp = product.msrp_cents === product.price_cents
  const Title = close ? motion.h2 : motion.h1
  const openGallery = (index: number, trigger: HTMLButtonElement) => {
    galleryTrigger.current = trigger
    setGalleryIndex(index)
  }
  const closeGallery = () => {
    setGalleryIndex(null)
    // Native close restores focus too; explicit return covers unmount ordering.
    requestAnimationFrame(() =>
      galleryTrigger.current?.focus({ preventScroll: true })
    )
  }
  return (
    <>
      <motion.div
        layoutId={layoutId("card")}
        layoutScroll
        className={close ? styles.detailCard : styles.standaloneCard}
      >
        <div className={styles.detailTop}>
          <Image
            className={styles.brandLogo}
            src={product.brand.logo_path}
            alt={product.brand.name}
            width={150}
            height={56}
          />
          {close && (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Close product details"
              data-detail-close
              onClick={close}
              autoFocus
            >
              <X size={20} />
            </button>
          )}
        </div>
        <div className={styles.detailHeading}>
          <div>
            <Title layoutId={layoutId("title")} id={titleId}>
              {product.name}
            </Title>
            <motion.p layoutId={layoutId("description")}>
              {product.short_description}
            </motion.p>
          </div>
          <div className={styles.detailCategory}>
            <Image
              src={product.category.artwork_path}
              alt=""
              width={64}
              height={64}
            />
            <span>{product.category.name}</span>
          </div>
        </div>
        {product.images.length > 0 && (
          <div
            className={styles.photoGrid}
            data-count={Math.min(product.images.length, 3)}
          >
            {product.images.slice(0, 3).map((image, index) => (
              <motion.button
                type="button"
                key={image.id}
                layoutId={index === 0 ? layoutId("image") : undefined}
                className={index === 0 ? styles.leadPhoto : styles.sidePhoto}
                aria-label={
                  index === 2 && product.images.length > 3
                    ? `View all ${product.images.length} photos`
                    : `Enlarge photo ${index + 1}: ${image.alt}`
                }
                onClick={(event) => openGallery(index, event.currentTarget)}
              >
                <Photo
                  image={image}
                  sizes={
                    index === 0
                      ? "(max-width: 700px) 62vw, 620px"
                      : "(max-width: 700px) 30vw, 300px"
                  }
                  eager
                />
                {index === 2 && product.images.length > 3 && (
                  <span className={styles.morePhotos}>
                    +{product.images.length - 3}
                    <span>photos</span>
                  </span>
                )}
              </motion.button>
            ))}
          </div>
        )}
        <div className={styles.detailsBody}>
          <div className={styles.description}>
            <p className={styles.intro}>{product.description_intro}</p>
            {product.features.length > 0 && (
              <ul>
                {product.features.map((feature, index) => (
                  <li key={index}>{feature}</li>
                ))}
              </ul>
            )}
            {product.description_closing && (
              <p className={styles.closing}>
                <strong>{product.description_closing}</strong>
              </p>
            )}
          </div>
          <aside className={styles.pricing} aria-label="Price and condition">
            {product.ready_for_audition && (
              <p className={styles.audition}>
                <Headphones size={15} strokeWidth={1.6} aria-hidden="true" />
                <span className={styles.badgeLabel}>Ready for Audition</span>
              </p>
            )}
            <ProductPrice product={product} detail />
            <dl>
              <div className={styles.conditionRow}>
                <dt>Visual condition</dt>
                <dd>
                  <span
                    className={styles.condition}
                    data-tone={conditionTone(product.condition)}
                  >
                    <span className={styles.badgeLabel}>
                      {product.condition}
                    </span>
                  </span>
                </dd>
              </div>
              {product.msrp_cents !== null && !atMsrp && (
                <div>
                  <dt>MSRP</dt>
                  <dd>
                    {isProductOnSale(product) ? (
                      <s>{formatPrice(product.msrp_cents)}</s>
                    ) : (
                      formatPrice(product.msrp_cents)
                    )}
                    <span className={styles.unit}>
                      USD / {product.price_unit}
                    </span>
                  </dd>
                </div>
              )}
            </dl>
            {product.manufacturer_url && (
              <a
                href={product.manufacturer_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Manufacturer info
                <ArrowUpRight size={16} aria-hidden="true" />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </aside>
        </div>
      </motion.div>
      {galleryIndex !== null && (
        <ProductGallery
          product={product}
          initialIndex={galleryIndex}
          onClose={closeGallery}
        />
      )}
    </>
  )
}

/** A product's details as its own page, at /products/<slug>. */
export function ProductPageView({ product }: { product: Product }) {
  return (
    <MotionConfig reducedMotion="user">
      <ProductDetails product={product} layoutId={() => undefined} />
    </MotionConfig>
  )
}

export function ProductCatalog({ products }: { products: Product[] }) {
  const [active, setActive] = useState<Product | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLAnchorElement | null>(null)
  const id = useId()
  const reducedMotion = useReducedMotion()
  const layoutId = (product: Product, part: string) =>
    reducedMotion ? undefined : `${id}-${product.id}-${part}`

  // Each product has a URL. Opening the details here pushes it; the shop
  // layout's @modal slot intercepts it, so this list stays mounted under the
  // dialog. Loaded directly, the URL shows the full product page instead.
  const router = useRouter()
  const pathname = usePathname()
  const routeSlug = pathname.startsWith(PRODUCT_PATH)
    ? decodeURIComponent(pathname.slice(PRODUCT_PATH.length))
    : null
  const routeProduct = products.find((item) => item.slug === routeSlug) ?? null

  // Back (or any navigation off the product URL) closes the details.
  const [syncedPath, setSyncedPath] = useState(pathname)
  if (pathname !== syncedPath) {
    setSyncedPath(pathname)
    if (!routeProduct && active) setActive(null)
  }

  useEffect(() => {
    if (!active) return
    const node = dialog.current
    node
      ?.querySelector<HTMLButtonElement>("[data-detail-close]")
      ?.focus({ preventScroll: true })
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = overflow
    }
  }, [active])

  useEffect(() => {
    const node = dialog.current
    return () => node?.close()
  }, [])

  // The native ::backdrop is out of Motion's reach and would otherwise stay at
  // full blur until the exit finishes, then vanish in one frame. Flagging the
  // dialog as soon as it closes (button, Escape, backdrop, or Back) lets CSS
  // fade it out while the card animates back.
  useLayoutEffect(() => {
    if (!active) dialog.current?.setAttribute("data-closing", "")
  }, [active])

  const showDetails = (product: Product, from: HTMLAnchorElement | null) => {
    trigger.current = from
    dialog.current?.removeAttribute("data-closing")
    // Open before mounting Motion's destination so its first layout
    // measurement sees the visible dialog geometry.
    dialog.current?.showModal()
    setActive(product)
  }

  // Forward to a product URL while this list is showing reopens its details.
  const reopen = useEffectEvent((product: Product) =>
    showDetails(product, null)
  )
  useEffect(() => {
    if (!routeProduct || active || dialog.current?.open) return
    const frame = requestAnimationFrame(() => reopen(routeProduct))
    return () => cancelAnimationFrame(frame)
  }, [routeProduct, active])

  const closeDetails = () => {
    setActive(null)
    // Leave the product URL, returning to the list's own address.
    if (routeProduct) router.back()
  }

  // The whole card opens the details; its link stays the one tab stop, so
  // keyboard and screen-reader users get the same action without a nested
  // control. A click on the link bubbles here, so there is one code path.
  const openDetails = (product: Product, event: MouseEvent<HTMLElement>) => {
    if (!isPlainClick(event)) return
    const card = event.currentTarget
    const selection = window.getSelection()
    const selectingText =
      !!selection?.toString() && card.contains(selection.anchorNode)
    // A drag that selects card text isn't a click on the card.
    if (selectingText && !(event.target as Element).closest("a")) return
    showDetails(product, card.querySelector<HTMLAnchorElement>("a"))
    router.push(productHref(product), { scroll: false })
  }

  return (
    <MotionConfig
      reducedMotion="user"
      transition={
        reducedMotion
          ? { duration: 0 }
          : { type: "spring", stiffness: 350, damping: 34 }
      }
    >
      <LayoutGroup id={id}>
        {products.length === 0 ? (
          <p className={styles.empty}>No products listed yet.</p>
        ) : (
          <ul className={styles.productList}>
            {products.map((product, index) => (
              <li key={product.id}>
                <motion.article
                  layoutId={layoutId(product, "card")}
                  className={styles.card}
                  onClick={(event) => openDetails(product, event)}
                >
                  <motion.div
                    layoutId={layoutId(product, "image")}
                    className={styles.cardPhoto}
                  >
                    {product.images[0] ? (
                      <Photo
                        image={product.images[0]}
                        sizes="(max-width: 700px) 85vw, 280px"
                        eager={index === 0}
                      />
                    ) : (
                      <span>Photo unavailable</span>
                    )}
                  </motion.div>
                  <div className={styles.cardText}>
                    <Image
                      className={styles.brandLogo}
                      src={product.brand.logo_path}
                      alt={product.brand.name}
                      width={130}
                      height={48}
                    />
                    <motion.h2 layoutId={layoutId(product, "title")}>
                      {product.name}
                    </motion.h2>
                    <motion.p layoutId={layoutId(product, "description")}>
                      {product.short_description}
                    </motion.p>
                  </div>
                  <div className={styles.cardAction}>
                    <ProductPrice product={product} />
                    <Link
                      href={productHref(product)}
                      scroll={false}
                      className={styles.detailsButton}
                      aria-haspopup="dialog"
                      aria-label={`Product details: ${product.name}`}
                      onPointerMove={trackGlassPointer}
                      onClick={(event) => {
                        // The card's handler opens the dialog and pushes the
                        // URL; other clicks follow the link to the full page.
                        if (isPlainClick(event)) event.preventDefault()
                      }}
                    >
                      <span>Product details</span>
                      <span className={styles.detailsIcon} aria-hidden="true">
                        <ArrowUpRight size={18} strokeWidth={1.4} />
                      </span>
                    </Link>
                  </div>
                </motion.article>
              </li>
            ))}
          </ul>
        )}
        <dialog
          ref={dialog}
          className={styles.detailDialog}
          aria-labelledby={active ? `product-title-${active.id}` : undefined}
          onCancel={(event) => {
            event.preventDefault()
            closeDetails()
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeDetails()
          }}
        >
          <AnimatePresence
            onExitComplete={() => {
              dialog.current?.close()
              trigger.current?.focus({ preventScroll: true })
            }}
          >
            {active && (
              <motion.div
                key={active.id}
                className={styles.detailWrap}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.18 }}
              >
                <ProductDetails
                  product={active}
                  layoutId={(part) => layoutId(active, part)}
                  close={closeDetails}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </dialog>
      </LayoutGroup>
    </MotionConfig>
  )
}
