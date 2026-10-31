import { Fragment } from "react"
import Image from "next/image"
import type { NewsBlock, NewsInline } from "@/lib/news"
import styles from "./news-body.module.css"

const IMAGE_SIZES = "(max-width: 760px) calc(100vw - 44px), 680px"

function Text({ text }: { text: string }) {
  const lines = text.split("\n")
  return lines.map((line, index) => (
    <Fragment key={index}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ))
}

function Inline({ content }: { content: NewsInline[] }) {
  return content.map((part, index) => {
    if (typeof part === "string") return <Text key={index} text={part} />
    const text = part.strong ? (
      <strong>
        <Text text={part.text} />
      </strong>
    ) : (
      <Text text={part.text} />
    )
    return part.href ? (
      <a key={index} href={part.href}>
        {text}
      </a>
    ) : (
      <Fragment key={index}>{text}</Fragment>
    )
  })
}

/** Renders a post body from lib/news-posts.ts. */
export function NewsBody({ blocks }: { blocks: NewsBlock[] }) {
  return (
    <div className={styles.body}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={index}>
                <Inline content={block.content} />
              </p>
            )
          case "heading":
            return <h2 key={index}>{block.text}</h2>
          case "list":
            return (
              <ul key={index}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>
                    <Inline content={item} />
                  </li>
                ))}
              </ul>
            )
          case "quote":
            return (
              <blockquote key={index}>
                <p>{block.text}</p>
              </blockquote>
            )
          case "image":
            return (
              <figure key={index}>
                <Image
                  src={block.image.src}
                  alt={block.image.alt}
                  width={block.image.width}
                  height={block.image.height}
                  sizes={IMAGE_SIZES}
                />
                {block.caption ? (
                  <figcaption>{block.caption}</figcaption>
                ) : null}
              </figure>
            )
        }
      })}
    </div>
  )
}
