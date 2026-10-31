"use client"

// Adapted from Aceternity's expandable-card-demo-standard registry source:
// https://ui.aceternity.com/components/expandable-card
// Retains shared card/image/title/description layout IDs and AnimatePresence.
// Adds native modal semantics, nested gallery, focus return, and reduced motion.
import { useEffect, useId, useRef, useState } from "react"
import Image from "next/image"
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  MotionConfig,
  useReducedMotion,
} from "motion/react"
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, X } from "lucide-react"
import { formatPrice, type Product, type ProductImage } from "@/lib/catalog"
import styles from "./product-catalog.module.css"

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
  close: () => void
}) {
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const galleryTrigger = useRef<HTMLButtonElement | null>(null)
  const titleId = `product-title-${product.id}`
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
        className={styles.detailCard}
      >
        <div className={styles.detailTop}>
          <Image
            className={styles.brandLogo}
            src={product.brand.logo_path}
            alt={product.brand.name}
            width={150}
            height={56}
          />
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
        </div>
        <div className={styles.detailHeading}>
          <div>
            <motion.h2 layoutId={layoutId("title")} id={titleId}>
              {product.name}
            </motion.h2>
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
                <Check size={14} aria-hidden="true" />
                Ready for Audition
              </p>
            )}
            <p className={styles.detailPrice}>
              {formatPrice(product.price_cents)}
              <span>USD / {product.price_unit}</span>
            </p>
            <dl>
              <div>
                <dt>Visual condition</dt>
                <dd>{product.condition}</dd>
              </div>
              {product.msrp_cents !== null && (
                <div>
                  <dt>MSRP</dt>
                  <dd>
                    {formatPrice(product.msrp_cents)}
                    <span>USD / {product.price_unit}</span>
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

export function ProductCatalog({ products }: { products: Product[] }) {
  const [active, setActive] = useState<Product | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const id = useId()
  const reducedMotion = useReducedMotion()
  const layoutId = (product: Product, part: string) =>
    reducedMotion ? undefined : `${id}-${product.id}-${part}`

  useEffect(() => {
    if (!active) return
    const node = dialog.current
    node?.querySelector<HTMLButtonElement>("[data-detail-close]")?.focus({ preventScroll: true })
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
                    <p>
                      {formatPrice(product.price_cents)}
                      <span>USD / {product.price_unit}</span>
                    </p>
                    <button
                      type="button"
                      className={styles.detailsButton}
                      aria-haspopup="dialog"
                      aria-label={`Product details: ${product.name}`}
                      onClick={(event) => {
                        trigger.current = event.currentTarget
                        // Open before mounting Motion's destination so its first
                        // layout measurement sees the visible dialog geometry.
                        dialog.current?.showModal()
                        setActive(product)
                      }}
                    >
                      Product details
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
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
            setActive(null)
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) setActive(null)
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
                  close={() => setActive(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </dialog>
      </LayoutGroup>
    </MotionConfig>
  )
}
