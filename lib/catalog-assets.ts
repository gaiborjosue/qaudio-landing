import { mediaUrl } from "./media"

/** Catalog assets can be bundled site files or immutable media-bucket objects. */
export function catalogAssetUrl(path: string) {
  return path.startsWith("/") || path.startsWith("https://")
    ? path
    : mediaUrl(path)
}

export function categoryAssets<
  T extends { artwork_path: string; scene_path: string },
>(row: T): T {
  return {
    ...row,
    artwork_path: catalogAssetUrl(row.artwork_path),
    scene_path: catalogAssetUrl(row.scene_path),
  }
}

export function brandAssets<T extends { logo_path: string }>(row: T): T {
  return { ...row, logo_path: catalogAssetUrl(row.logo_path) }
}

export function productTaxonomyAssets<
  T extends {
    category: { artwork_path: string }
    brand: { logo_path: string }
  },
>(row: T): T {
  return {
    ...row,
    category: {
      ...row.category,
      artwork_path: catalogAssetUrl(row.category.artwork_path),
    },
    brand: brandAssets(row.brand),
  }
}
