// Pre-renders the dotted world behind the history map slide
// (components/ui/world-map.tsx), so dotted-map never ships to the browser.
// Run with `node scripts/world-dots.mjs` after changing these options.
import { writeFileSync } from "node:fs"
import DottedMap from "dotted-map"

const map = new DottedMap({ height: 100, grid: "diagonal" })
const svg = map
  .getSVG({
    radius: 0.22,
    color: "#00000040",
    shape: "circle",
    backgroundColor: "white",
  })
  // One shared fill on a group instead of on each of the ~10k dots.
  .replace(/\s*\n\s*/g, "")
  .replaceAll(' fill="#00000040"', "")
  .replace(/(<svg[^>]*>)/, '$1<g fill="#00000040">')
  .replace("</svg>", "</g></svg>")
writeFileSync(new URL("../public/story/world-dots.svg", import.meta.url), svg)
console.log(`public/story/world-dots.svg: ${Math.round(svg.length / 1024)} KB`)
