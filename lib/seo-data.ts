import "server-only"
import type { MetadataRoute } from "next"
import { cacheLife, cacheTag } from "next/cache"
import {
  CATALOG_CACHE_TAG,
  getCatalogTaxonomy,
  getProductSitemapEntries,
} from "./catalog-data"
import { NEWS_CACHE_TAG, getNewsSitemapEntries } from "./news-data"
import { NEWS_ARCHIVE_PAGE_SIZE, newsArchiveHref } from "./news"
import { PUBLIC_PAGES, siteUrl } from "./site"

export async function getSitemap(): Promise<MetadataRoute.Sitemap> {
  "use cache"
  cacheLife({ stale: 0, revalidate: 30, expire: 60 })
  cacheTag(CATALOG_CACHE_TAG, NEWS_CACHE_TAG)
  const [{ categories, brands }, products, posts] = await Promise.all([
    getCatalogTaxonomy(),
    getProductSitemapEntries(),
    getNewsSitemapEntries(),
  ])
  return [
    ...PUBLIC_PAGES.map((path) => ({ url: siteUrl(path) })),
    ...categories.map(({ slug }) => ({ url: siteUrl(`/shop/${slug}`) })),
    ...brands.map(({ slug }) => ({
      url: siteUrl(`/shop?brand=${encodeURIComponent(slug)}`),
    })),
    ...products.map((product) => ({
      url: siteUrl(`/products/${product.slug}`),
      lastModified: product.modifiedAt,
      images: product.images,
    })),
    ...posts.map((post) => ({
      url: siteUrl(`/news/${post.slug}`),
      lastModified: post.modifiedAt,
      images: post.images,
    })),
    ...Array.from(
      {
        length: Math.max(
          0,
          Math.ceil(posts.length / NEWS_ARCHIVE_PAGE_SIZE) - 1
        ),
      },
      (_, index) => ({ url: siteUrl(newsArchiveHref(index + 2)) })
    ),
  ]
}
