"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useState } from "react"
import { ArrowUpRight } from "lucide-react"
import OptionWheel from "@/components/OptionWheel"
import { LiquidGlass } from "@/components/ui/liquid-glass"
import { CATEGORIES, CATEGORY_LABELS, DEFAULT_CATEGORY } from "@/lib/categories"

export function CategorySection() {
  const [selected, setSelected] = useState(DEFAULT_CATEGORY)
  const [previewed, setPreviewed] = useState([DEFAULT_CATEGORY])
  const [wheelSize, setWheelSize] = useState({ fontSize: 3.25, inset: 96 })
  const category = CATEGORIES[selected]

  function selectCategory(index: number) {
    setSelected(index)
    setPreviewed((visited) =>
      visited.includes(index) ? visited : [...visited, index]
    )
  }

  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 700px)")
    const tablet = window.matchMedia("(max-width: 1100px)")
    const update = () =>
      setWheelSize(
        mobile.matches
          ? { fontSize: 1.9, inset: 62 }
          : tablet.matches
            ? { fontSize: 2.5, inset: 76 }
            : { fontSize: 3.25, inset: 96 }
      )
    update()
    mobile.addEventListener("change", update)
    tablet.addEventListener("change", update)
    return () => {
      mobile.removeEventListener("change", update)
      tablet.removeEventListener("change", update)
    }
  }, [])

  return (
    <section
      className="category-section"
      id="categories"
      aria-labelledby="categories-title"
    >
      <div className="category-heading">
        <div>
          <h2 id="categories-title">
            What are you
            <br />
            looking for?
          </h2>
          <p className="category-subtitle">
            A few favorites from the brands we carry. Ask us about the rest.
          </p>
        </div>
      </div>

      <div className="category-explorer">
        <div className="category-wheel-panel">
          <OptionWheel
            items={CATEGORY_LABELS}
            defaultSelected={DEFAULT_CATEGORY}
            onChange={selectCategory}
            fontSize={wheelSize.fontSize}
            inset={wheelSize.inset}
            textColor="#777777"
            activeColor="#111111"
            loop
            soundUrl="/sounds/option-tick.mp3"
            soundVolume={0.45}
          />
        </div>

        <div className="category-preview">
          <div className="category-atmosphere" aria-hidden="true">
            {previewed.map((index) => {
              const item = CATEGORIES[index]
              return (
                <div
                  key={item.slug}
                  className={
                    index === selected
                      ? "category-scene is-selected"
                      : "category-scene"
                  }
                >
                  <Image
                    className="category-scene-haze"
                    src={item.scene}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 100vw, 70vw"
                  />
                  <Image
                    className="category-scene-detail"
                    src={item.scene}
                    alt=""
                    fill
                    sizes="(max-width: 700px) 100vw, 70vw"
                  />
                </div>
              )
            })}
          </div>
          <div className="category-artwork" aria-hidden="true">
            {CATEGORIES.map((item, index) => (
              <Image
                key={item.slug}
                src={`/categories/${item.icon}`}
                alt=""
                width={500}
                height={500}
                sizes="(max-width: 700px) 220px, 360px"
                className={
                  index === selected
                    ? "category-icon is-selected"
                    : "category-icon"
                }
              />
            ))}
          </div>
          <div
            className="category-preview-caption"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="category-count">
              {String(selected + 1).padStart(2, "0")} /{" "}
              {String(CATEGORIES.length).padStart(2, "0")}
            </span>
            <h3>{category.name}</h3>
          </div>
          <LiquidGlass
            className="glass-action category-shop-glass"
            radius={31}
            scale={120}
            aberration={56}
            bevelDepth={60}
            frost={0}
            tint={0}
            onPointerMove={(event) => {
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
            }}
          >
            <Link
              className="glass-action-content"
              href={`/shop/${category.slug}`}
              aria-label={`See ${category.name} products`}
            >
              <span>See Products</span>
              <span className="glass-action-icon" aria-hidden="true">
                <ArrowUpRight size={21} strokeWidth={1.4} />
              </span>
            </Link>
          </LiquidGlass>
        </div>
      </div>
    </section>
  )
}
