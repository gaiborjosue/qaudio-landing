const noIndex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }]

/** Fail closed on demo/preview/custom hosts, even on a production deployment. */
export function indexingHeaders(preview = false) {
  return [
    {
      source: "/:path*",
      missing: [{ type: "host" as const, value: "(?:www\\.)?qaudio\\.com" }],
      headers: noIndex,
    },
    ...(preview ? [{ source: "/:path*", headers: noIndex }] : []),
    ...[
      "/admin/:path*",
      "/auth/:path*",
      "/api/:path*",
      "/eve/:path*",
      "/_eve_internal/:path*",
    ].map((source) => ({ source, headers: noIndex })),
  ]
}
