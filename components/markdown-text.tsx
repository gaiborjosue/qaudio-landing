import type { ReactNode } from "react"

// A small, safe Markdown subset for product descriptions: paragraphs (a
// single line break stays a break), "-" and "1." lists, "#" headings,
// **bold**, *italic*, and [links](https://…). It builds React elements and
// never HTML, so nothing typed into a description can add markup or
// scripts, and it needs no client JavaScript of its own (no hooks).

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "h"; level: number; text: string }

const BULLET = /^\s*[-*+•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/
const HEADING = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/

function toBlocks(text: string): Block[] {
  const blocks: Block[] = []
  // Whether the next line can join the last block (no blank line between).
  let joining = false
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      joining = false
      continue
    }
    const last = joining ? blocks.at(-1) : undefined
    const heading = line.match(HEADING)
    const bullet = line.match(BULLET)
    const listed = bullet ?? line.match(NUMBERED)
    joining = true
    if (heading) {
      blocks.push({ kind: "h", level: heading[1].length, text: heading[2] })
      joining = false
    } else if (listed) {
      const kind = bullet ? "ul" : "ol"
      if ((last?.kind === "ul" || last?.kind === "ol") && last.kind === kind) {
        last.items.push(listed[1])
      } else {
        blocks.push({ kind, items: [listed[1]] })
      }
    } else if (
      (last?.kind === "ul" || last?.kind === "ol") &&
      /^\s/.test(raw)
    ) {
      // An indented line continues the list item above it.
      last.items[last.items.length - 1] += ` ${line.trim()}`
    } else if (last?.kind === "p") {
      last.lines.push(line.trim())
    } else {
      blocks.push({ kind: "p", lines: [line.trim()] })
    }
  }
  return blocks
}

const INLINE =
  /\*\*(.+?)\*\*|__(.+?)__|\*(?!\s)(.+?)(?<!\s)\*|(?<![\p{L}\p{N}])_(?!\s)(.+?)(?<!\s)_(?![\p{L}\p{N}])|\[([^\]]+)\]\(([^)\s]+)\)/gu

// Site paths, web pages, and email only; anything else is left as text.
const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/))/i

function inline(text: string, key: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const at = match.index
    if (at > last) nodes.push(text.slice(last, at))
    const id = `${key}.${at}`
    const [, bold, boldAlt, em, emAlt, label, href] = match
    if (bold ?? boldAlt) {
      nodes.push(<strong key={id}>{inline(bold ?? boldAlt, id)}</strong>)
    } else if (em ?? emAlt) {
      nodes.push(<em key={id}>{inline(em ?? emAlt, id)}</em>)
    } else if (SAFE_HREF.test(href)) {
      const external = /^https?:/i.test(href)
      nodes.push(
        <a
          key={id}
          href={href}
          {...(external && { target: "_blank", rel: "noreferrer" })}
        >
          {inline(label, id)}
          {external && (
            <span className="visually-hidden"> (opens in a new tab)</span>
          )}
        </a>
      )
    } else {
      nodes.push(...inline(label, id))
    }
    last = at + match[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/** Markdown text as elements: see the subset above. */
export function MarkdownText({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  return (
    <div className={className}>
      {toBlocks(text).map((block, index) => {
        const key = String(index)
        switch (block.kind) {
          case "h": {
            const Heading = block.level <= 3 ? "h3" : "h4"
            return <Heading key={key}>{inline(block.text, key)}</Heading>
          }
          case "ul":
          case "ol": {
            const List = block.kind
            return (
              <List key={key}>
                {block.items.map((item, at) => (
                  <li key={at}>{inline(item, `${key}.${at}`)}</li>
                ))}
              </List>
            )
          }
          default:
            return (
              <p key={key}>
                {block.lines.flatMap((line, at) => [
                  ...(at > 0 ? [<br key={`${key}.br${at}`} />] : []),
                  ...inline(line, `${key}.${at}`),
                ])}
              </p>
            )
        }
      })}
    </div>
  )
}
