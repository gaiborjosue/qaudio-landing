import Image from "next/image"
import { HistoryMap } from "@/components/history-map"

type Photo = { src: string; width: number; height: number; alt: string }

type Chapter = {
  /** Track number on the record: side A is the past, side B the present. */
  track: string
  year: string
  title: string
  text: string
  /** One photo, or several as a contact sheet. */
  photos?: Photo[]
  /** The export routes on a world map. Chapters without media show the year. */
  map?: boolean
}

// Drawn from Q Audio's own history; confirm wording with the owner.
export const HISTORY: Chapter[] = [
  {
    track: "A1",
    year: "1973",
    title: "It began in the back pages.",
    text: "Q Audio began as a mail-order business, buying and selling used hi-fi through the classified ads in the back of Audio Magazine.",
  },
  {
    track: "A2",
    year: "Late ’70s",
    title: "Tube classics, shipped worldwide.",
    text: "From a storeroom in the original Tech HiFi store at 95 Vassar Street, we exported hand-crafted American and European vacuum tube gear to collectors in Japan, Asia and Europe.",
    map: true,
  },
  {
    track: "A3",
    year: "1980",
    title: "A storage room on Vassar Street became a store.",
    text: "In early fall 1980 the storeroom opened as a shop for pre-owned hi-fi, and new brands followed for nearby colleges. Hafler amplifier kits sold briskly to MIT students.",
    photos: [
      {
        src: "/story/vassar-street.webp",
        width: 700,
        height: 525,
        alt: "The original Q Audio storefront at 95 Vassar Street, Cambridge",
      },
    ],
  },
  {
    track: "A4",
    year: "1982",
    title: "Bringing home the first CD players.",
    text: "In October 1982 we brought the very first CD players to the US from the Tokyo Audio Show Fair, announced in the New York Times classifieds. Krell and Pyramid Loudspeakers joined the lineup that year.",
  },
  {
    track: "A5",
    year: "1982–2013",
    title: "The world’s smallest hi-fi store.",
    text: "We grew with the digital audio revolution: product lines galore, open six days a week, and five full-time people in one small showroom on a side street in Cambridge.",
    photos: [
      {
        src: "/story/old-showroom.webp",
        width: 1100,
        height: 825,
        alt: "Q Audio’s original showroom, with speakers along the walls and two listening chairs",
      },
    ],
  },
  {
    track: "B1",
    year: "2013",
    title: "Room to grow.",
    text: "In October 2013 we moved to a larger storefront at 5 Brookline Street in Central Square, across from the Middle East, a five-minute walk up Mass Ave from where it started.",
    photos: [
      {
        src: "/story/brookline-street.webp",
        width: 765,
        height: 1020,
        alt: "Q Audio’s storefront at 5 Brookline Street, Central Square",
      },
    ],
  },
  {
    track: "B2",
    year: "Today",
    title: "Still a local shop, made for listening.",
    text: "Pull up a chair, or bring your favorite music, and hear it for yourself.",
    photos: [
      {
        src: "/story/showroom-front.webp",
        width: 1000,
        height: 750,
        alt: "Inside Q Audio, looking out through the front windows",
      },
      {
        src: "/story/listening-room.webp",
        width: 640,
        height: 480,
        alt: "Tall white floorstanding speakers set up in the listening room",
      },
      {
        src: "/story/headphone-wall.webp",
        width: 640,
        height: 480,
        alt: "A wall of Grado headphones on display",
      },
      {
        src: "/story/thorens-turntable.webp",
        width: 750,
        height: 1000,
        alt: "A Thorens turntable on a wooden stand",
      },
    ],
  },
]

const mediaKind = ({ photos, map }: Chapter) =>
  map ? "map" : !photos ? "year" : photos.length > 1 ? "sheet" : "photo"

/**
 * Q Audio's history. The scroll story plays it as horizontal slides above the
 * turntable (components/scroll-experience.tsx); otherwise it's a plain list.
 */
export function StoryHistory() {
  return (
    <section className="history" aria-labelledby="history-title">
      <h2 id="history-title" className="visually-hidden">
        Q Audio since 1973
      </h2>
      <ol className="history-track">
        {HISTORY.map((chapter) => {
          const { track, year, title, text, photos } = chapter
          const media = mediaKind(chapter)
          return (
            <li key={track} className="history-slide" data-media={media}>
              <div className="history-media">
                {media === "map" ? (
                  <HistoryMap />
                ) : photos ? (
                  photos.map((photo) => (
                    <Image
                      key={photo.src}
                      src={photo.src}
                      alt={photo.alt}
                      width={photo.width}
                      height={photo.height}
                      sizes={
                        photos.length > 1
                          ? "(max-width: 1000px) 46vw, 300px"
                          : "(max-width: 1000px) 92vw, 600px"
                      }
                    />
                  ))
                ) : (
                  <span className="history-year" aria-hidden="true">
                    {year}
                  </span>
                )}
              </div>
              <div className="history-text">
                <p className="history-label">
                  {track}
                  <span
                    className={media === "year" ? "visually-hidden" : undefined}
                  >
                    {" "}
                    · {year}
                  </span>
                </p>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
