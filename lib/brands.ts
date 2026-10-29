export const BRANDS = [
  {
    slug: "bluesound",
    name: "Bluesound",
    logo: "/brands/bluesound.png",
  },
  {
    slug: "denon",
    name: "Denon",
    logo: "/brands/denon.png",
  },
  {
    slug: "kimber-kable",
    name: "Kimber Kable",
    logo: "/brands/kimber-kable.png",
  },
  {
    slug: "klipsch",
    name: "Klipsch",
    logo: "/brands/klipsch.png",
  },
  {
    slug: "marantz",
    name: "Marantz",
    logo: "/brands/marantz.png",
  },
  {
    slug: "musical-fidelity",
    name: "Musical Fidelity",
    logo: "/brands/musical-fidelity.png",
  },
  {
    slug: "ortofon",
    name: "Ortofon",
    logo: "/brands/ortofon.png",
  },
  {
    slug: "parasound",
    name: "Parasound",
    logo: "/brands/parasound.png",
  },
  {
    slug: "salamander-designs",
    name: "Salamander Designs",
    logo: "/brands/salamander-designs.png",
  },
  {
    slug: "sonos",
    name: "Sonos",
    logo: "/brands/sonos.png",
  },
  {
    slug: "thorens",
    name: "Thorens",
    logo: "/brands/thorens.png",
  },
  {
    slug: "pro-ject",
    name: "Pro-Ject",
    logo: "/brands/pro-ject.png",
  },
  {
    slug: "paradigm",
    name: "Paradigm",
    logo: "/brands/paradigm.png",
  },
  {
    slug: "sumiko",
    name: "Sumiko",
    logo: "/brands/sumiko.png",
  },
  {
    slug: "grado",
    name: "Grado",
    logo: "/brands/grado.png",
  },
  {
    slug: "anthem",
    name: "Anthem",
    logo: "/brands/anthem.png",
  },
  {
    slug: "nad",
    name: "NAD",
    logo: "/brands/nad.png",
  },
  {
    slug: "heos",
    name: "HEOS",
    logo: "/brands/heos.png",
  },
  {
    slug: "andover-audio",
    name: "Andover Audio",
    logo: "/brands/andover-audio.png",
  },
  {
    slug: "kef",
    name: "KEF",
    logo: "/brands/kef.png",
  },
  {
    slug: "klh",
    name: "KLH",
    logo: "/brands/klh.svg",
  },
  {
    slug: "u-turn-audio",
    name: "U-Turn Audio",
    logo: "/brands/u-turn-audio.jpg",
  },
  {
    slug: "dali",
    name: "Dali",
    logo: "/brands/dali.png",
  },
] as const

export const BRAND_TILES = BRANDS.map((brand) => ({
  image: brand.logo,
  title: brand.name,
  href: `/shop?brand=${brand.slug}`,
}))
