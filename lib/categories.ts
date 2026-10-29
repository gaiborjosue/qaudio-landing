export const CATEGORIES = [
  {
    slug: "amplifiers",
    scene: "/category-scenes/amplifiers.jpeg",
    label: "Amplifiers",
    name: "Amplifiers",
    icon: "amplifiers.png",
  },
  {
    slug: "av-furniture",
    scene: "/category-scenes/av-furniture.jpeg",
    label: "AV Furniture",
    name: "AV Furniture",
    icon: "av-furniture.png",
  },
  {
    slug: "cables",
    scene: "/category-scenes/cables.jpeg",
    label: "Cables",
    name: "Cables",
    icon: "cables.png",
  },
  {
    slug: "cd-sacd",
    scene: "/category-scenes/cd-sacd.png",
    label: "CD / SACD",
    name: "CD / SACD Players",
    icon: "cd-sacd.png",
  },
  {
    slug: "thorens-parts",
    scene: "/category-scenes/thorens-parts.png",
    label: "Thorens Parts",
    name: "Genuine Thorens Parts",
    icon: "thorens-parts.png",
  },
  {
    slug: "headphones",
    scene: "/category-scenes/headphones.png",
    label: "Headphones",
    name: "Headphones",
    icon: "headphones.png",
  },
  {
    slug: "network-players",
    scene: "/category-scenes/network-players.png",
    label: "Network Players",
    name: "Network Players, Hi-Res Audio & DACs",
    icon: "network-players.png",
  },
  {
    slug: "phono-cartridges",
    scene: "/category-scenes/phono-cartridges.webp",
    label: "Phono Cartridges",
    name: "Phono Cartridges",
    icon: "phono-cartridges.png",
  },
  {
    slug: "preamplifiers",
    scene: "/category-scenes/preamplifiers.jpg",
    label: "Preamplifiers",
    name: "Preamplifiers & Processors",
    icon: "preamplifiers.svg",
  },
  {
    slug: "receivers",
    scene: "/category-scenes/receivers.jpeg",
    label: "Receivers",
    name: "Receivers",
    icon: "receivers.png",
  },
  {
    slug: "speakers",
    scene: "/category-scenes/speakers.jpeg",
    label: "Speakers",
    name: "Speakers",
    icon: "speakers.png",
  },
  {
    slug: "subwoofers",
    scene: "/category-scenes/subwoofers.jpg",
    label: "Subwoofers",
    name: "Subwoofers",
    icon: "subwoofers.svg",
  },
  {
    slug: "turntables",
    scene: "/category-scenes/turntables.jpg",
    label: "Turntables",
    name: "Turntables",
    icon: "turntables.png",
  },
  {
    slug: "used-equipment",
    scene: "/category-scenes/used-equipment.jpeg",
    label: "Used Equipment",
    name: "Used Equipment",
    icon: "used-equipment.png",
  },
] as const

export const CATEGORY_LABELS = CATEGORIES.map((category) => category.label)
export const DEFAULT_CATEGORY = CATEGORIES.findIndex(
  (category) => category.slug === "turntables"
)
