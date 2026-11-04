import { lookup as dnsLookup, type LookupAddress } from "node:dns"
import { request as httpsRequest } from "node:https"
import { BlockList, isIP, type LookupFunction } from "node:net"

// Requests the server makes to addresses an admin typed: a manufacturer's
// product page and its photos. Server-only (Node built-ins); no `server-only`
// import, so scripts/product-prefill.test.mjs can load it.
//
// Only https on the default port, to public internet addresses. Every
// address a name resolves to is checked as the connection is made (and again
// after each redirect), so a name can't point the server at itself, its
// cloud metadata, or a private network, even by changing its DNS between the
// check and the request.

const PRIVATE_V4 = new BlockList()
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  PRIVATE_V4.addSubnet(network, prefix, "ipv4")
}

// IPv6: only global unicast (2000::/3), minus documentation, Teredo, and
// 6to4 ranges, which can wrap private IPv4 addresses. Mapped IPv4
// (::ffff:…), NAT64, unique-local, and link-local addresses fall outside it.
const GLOBAL_V6 = new BlockList()
GLOBAL_V6.addSubnet("2000::", 3, "ipv6")
const PRIVATE_V6 = new BlockList()
for (const [network, prefix] of [
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const) {
  PRIVATE_V6.addSubnet(network, prefix, "ipv6")
}

/** Whether an IP address is on the public internet. */
export function isPublicAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return !PRIVATE_V4.check(address, "ipv4")
  if (family === 6) {
    return (
      GLOBAL_V6.check(address, "ipv6") && !PRIVATE_V6.check(address, "ipv6")
    )
  }
  return false
}

const LOCAL_NAME = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/i

/**
 * An address the server may request: https, the default port, no
 * credentials, and a public-looking host. Null otherwise. The fragment is
 * dropped. Names are checked again when they resolve.
 */
export function publicUrl(text: string): URL | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password) return null
  if (url.port && url.port !== "443") return null
  const host = url.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host)) {
    if (!isPublicAddress(host)) return null
  } else if (!host.includes(".") || LOCAL_NAME.test(host)) {
    return null
  }
  url.hash = ""
  return url
}

/** Why a request was refused or cut short, in words safe to show. */
export class PublicFetchError extends Error {
  reason: "blocked" | "redirect" | "timeout" | "too-large"
  constructor(reason: PublicFetchError["reason"]) {
    super(`Request ${reason}`)
    this.reason = reason
  }
}

type Resolve = (
  hostname: string,
  family: number | undefined,
  callback: (
    error: NodeJS.ErrnoException | null,
    addresses: LookupAddress[]
  ) => void
) => void

const resolveAll: Resolve = (hostname, family, callback) =>
  dnsLookup(
    hostname,
    { all: true, family: family === 4 || family === 6 ? family : 0 },
    callback
  )

/**
 * A DNS lookup for Node's sockets that refuses names with any non-public
 * address. `resolve` is replaceable for tests.
 */
export function guardedLookup(resolve: Resolve = resolveAll): LookupFunction {
  return (hostname, options, callback) => {
    const family =
      options.family === "IPv4"
        ? 4
        : options.family === "IPv6"
          ? 6
          : Number(options.family) || undefined
    resolve(hostname, family, (error, found) => {
      if (error) return callback(error, "")
      if (
        !found.length ||
        found.some((entry) => !isPublicAddress(entry.address))
      ) {
        return callback(new PublicFetchError("blocked"), "")
      }
      if (options.all) return callback(null, found)
      callback(null, found[0].address, found[0].family)
    })
  }
}

export type PublicResponse = {
  /** Where the answer came from, after redirects. */
  url: URL
  status: number
  /** The Content-Type header, lowercased. */
  type: string
  /** The body, when `maxBytes` asked for one and the status was 2xx. */
  body: Buffer | null
}

export type PublicRequestOptions = {
  method?: "GET" | "HEAD"
  headers?: Record<string, string>
  /** Read up to this many bytes of a 2xx body; 0 reads none. */
  maxBytes?: number
  maxRedirects?: number
  signal?: AbortSignal
  lookup?: LookupFunction
}

export type PublicRequester = (
  url: URL,
  options?: PublicRequestOptions
) => Promise<PublicResponse>

function send(
  url: URL,
  {
    method,
    headers,
    maxBytes,
    signal,
    lookup,
  }: Required<Omit<PublicRequestOptions, "maxRedirects" | "signal">> & {
    signal?: AbortSignal
  }
) {
  return new Promise<PublicResponse & { location?: string }>(
    (resolve, reject) => {
      const request = httpsRequest(
        url,
        { method, headers, lookup, signal, agent: false, timeout: 15_000 },
        (response) => {
          const status = response.statusCode ?? 0
          const type = String(response.headers["content-type"] ?? "")
            .toLowerCase()
            .trim()
          const location =
            status >= 300 && status < 400
              ? response.headers.location
              : undefined
          // Nothing more to read: drop the connection rather than download
          // a page nobody asked for.
          if (!maxBytes || method === "HEAD" || status < 200 || status > 299) {
            response.destroy()
            resolve({ url, status, type, body: null, location })
            return
          }
          if (Number(response.headers["content-length"]) > maxBytes) {
            response.destroy()
            reject(new PublicFetchError("too-large"))
            return
          }
          const chunks: Buffer[] = []
          let size = 0
          response.on("data", (chunk: Buffer) => {
            size += chunk.length
            if (size > maxBytes) {
              response.destroy()
              reject(new PublicFetchError("too-large"))
              return
            }
            chunks.push(chunk)
          })
          response.on("end", () =>
            resolve({ url, status, type, body: Buffer.concat(chunks) })
          )
          response.on("error", reject)
        }
      )
      request.on("timeout", () =>
        request.destroy(new PublicFetchError("timeout"))
      )
      request.on("error", reject)
      request.end()
    }
  )
}

/**
 * One request to a public https address (see publicUrl), following up to
 * `maxRedirects` redirects, each checked the same way. Throws on network
 * failures, refused addresses, and bodies over `maxBytes`.
 */
export const publicRequest: PublicRequester = async (
  start,
  {
    method = "GET",
    headers = {},
    maxBytes = 0,
    maxRedirects = 4,
    signal,
    lookup = guardedLookup(),
  } = {}
) => {
  let url = publicUrl(start.href)
  if (!url) throw new PublicFetchError("blocked")
  for (let hop = 0; ; hop += 1) {
    const response = await send(url, {
      method,
      headers,
      maxBytes,
      signal,
      lookup,
    })
    if (!response.location) return response
    if (hop >= maxRedirects) throw new PublicFetchError("redirect")
    let next: URL | null = null
    try {
      next = publicUrl(new URL(response.location, url).href)
    } catch {
      next = null
    }
    if (!next) throw new PublicFetchError("blocked")
    url = next
  }
}
