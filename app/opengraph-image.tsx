import { ImageResponse } from "next/og"

export const alt =
  "Q Audio — Independent hi-fi in Cambridge, Massachusetts, since 1973"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "64px 76px",
        background: "#f5f5f5",
        color: "#161616",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: -2 }}>
          Q AUDIO
        </div>
        <div style={{ fontSize: 20 }}>INDEPENDENT HI-FI SINCE 1973</div>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontSize: 92,
          fontWeight: 700,
          letterSpacing: -5,
          lineHeight: 1,
        }}
      >
        <span>For the love</span>
        <span>of listening.</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 24,
        }}
      >
        <span>Cambridge, Massachusetts</span>
        <span>qaudio.com</span>
      </div>
    </div>,
    size
  )
}
