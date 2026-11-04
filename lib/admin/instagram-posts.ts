import Zernio, { ZernioApiError } from "@zernio/node"
import { z } from "zod"
import { STORE_TIME_ZONE } from "../store-hours"
import type { InstagramFit, InstagramKind } from "./instagram"
import { instagramPhotoSchema, type InstagramPhotoInput } from "./schemas"
import { toStoreDateTime } from "./store-time"
import { zernioInstagramStatus, type ZernioConfig } from "./zernio-api"

// Instagram publishing through Zernio, for the admin agent's tools. As in
// zernio-api.ts, every reply is parsed down to an allowlist and every error
// is reworded, so provider payloads, keys, and tokens never reach the agent,
// the browser, memory, or logs. Callers check the signed-in admin first, and
// the profile comes only from the server's configuration. Relative imports,
// because the agent imports this too.

type Fetcher = typeof fetch

const READ_TIMEOUT_MS = 20_000
/** Publishing now happens inside the request and can take minutes. */
const PUBLISH_TIMEOUT_MS = 240_000
const UPLOAD_TIMEOUT_MS = 60_000

const OBJECT_ID = /^[a-f0-9]{24}$/i
const INSTAGRAM_URL = /^https:\/\/(www\.)?instagram\.com\//
/** Statuses Tune can change, and the ones Zernio lets it delete. */
const EDITABLE = new Set(["draft", "scheduled"])
const DELETABLE = new Set([
  "draft",
  "scheduled",
  "failed",
  "cancelled",
  "pending_approval",
])

/** An error whose message is safe for the model and the owner to read. */
export class InstagramError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "InstagramError"
  }
}

const sdk = (config: ZernioConfig, timeout = READ_TIMEOUT_MS) =>
  new Zernio({ apiKey: config.apiKey, timeout })

const via = (fetcher: Fetcher) => ({
  fetch: fetcher,
  cache: "no-store" as const,
  redirect: "error" as const,
})

/** A short provider message without links, keys, or token-like strings. */
export function redact(text: string, config?: ZernioConfig | null) {
  let safe = text
  if (config?.apiKey) safe = safe.split(config.apiKey).join("[redacted]")
  return safe
    .replace(/https?:\/\/\S+/gi, "[link]")
    .replace(/[A-Za-z0-9_\-+/=]{32,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
}

function reword(error: unknown, config: ZernioConfig) {
  if (error instanceof InstagramError) return error
  if (error instanceof ZernioApiError) {
    switch (error.statusCode) {
      case 401:
      case 403:
        return new InstagramError(
          "The Zernio API key or profile access needs attention."
        )
      case 402:
        return new InstagramError(
          "Zernio billing needs attention before Instagram can be used."
        )
      case 404:
        return new InstagramError(
          "That Instagram post isn't in Zernio anymore. Check instagram__list_posts."
        )
      case 429:
        return new InstagramError("Zernio is busy. Try again in a minute.")
      case 400:
      case 422: {
        const reason = redact(error.message, config)
        return new InstagramError(
          `Zernio didn't accept it${reason ? `: ${reason}` : "."}`
        )
      }
    }
    return new InstagramError(
      "Zernio couldn't do that right now. Try again shortly."
    )
  }
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new InstagramError(
      "Zernio didn't answer in time. Check instagram__list_posts before trying again, in case it went through."
    )
  }
  return new InstagramError("Zernio couldn't be reached. Try again shortly.")
}

export type InstagramAccount = { id: string; username: string }

/** This profile's connected Instagram accounts, or why there are none. */
export async function connectedInstagramAccounts(
  config: ZernioConfig,
  fetcher: Fetcher = fetch
): Promise<InstagramAccount[]> {
  const status = await zernioInstagramStatus(config, fetcher)
  if (status.state !== "connected") {
    throw new InstagramError(status.message ?? "Instagram isn't connected.")
  }
  return status.accounts
}

export function pickInstagramAccount(
  accounts: InstagramAccount[],
  username?: string
) {
  const names = accounts.map((account) => `@${account.username}`).join(", ")
  if (username) {
    const wanted = username.replace(/^@+/, "").toLowerCase()
    const account = accounts.find(
      (item) => item.username.toLowerCase() === wanted
    )
    if (!account) {
      throw new InstagramError(
        `@${wanted} isn't connected to this site. Connected: ${names}.`
      )
    }
    return account
  }
  if (accounts.length !== 1) {
    throw new InstagramError(
      `Several Instagram accounts are connected (${names}); say which one to post as.`
    )
  }
  return accounts[0]
}

const healthSchema = z.object({
  accounts: z
    .array(
      z.object({
        accountId: z.string(),
        canPost: z.boolean().optional(),
        needsReconnect: z.boolean().optional(),
        issues: z.array(z.string()).optional(),
      })
    )
    .default([]),
})

const limitSchema = z.object({
  quotaUsage: z.number().int().nonnegative(),
  quotaTotal: z.number().int().positive(),
  quotaDurationSeconds: z.number().positive().optional(),
})

export type InstagramAccountHealth = {
  state: string
  message: string | null
  accounts: {
    username: string
    can_post: boolean | null
    needs_reconnect: boolean | null
    issues: string[]
    /** Posts Instagram still allows in its rolling window. */
    posts_left: number | null
    window_hours: number | null
  }[]
}

/** Connection, posting health, and what's left of the publishing limit. */
export async function instagramAccountHealth(
  config: ZernioConfig,
  fetcher: Fetcher = fetch
): Promise<InstagramAccountHealth> {
  const status = await zernioInstagramStatus(config, fetcher)
  if (status.state !== "connected") {
    return {
      state: status.state,
      message: status.message ?? null,
      accounts: [],
    }
  }
  const client = sdk(config)
  // Health and limits add detail; the connection itself is already known.
  const health = new Map<
    string,
    z.infer<typeof healthSchema>["accounts"][number]
  >()
  try {
    const { data } = await client.accounts.getAllAccountsHealth({
      query: { profileId: config.profileId, platform: "instagram" },
      ...via(fetcher),
    })
    for (const account of healthSchema.parse(data).accounts) {
      health.set(account.accountId, account)
    }
  } catch {
    // Reported as unknown below.
  }
  const accounts = await Promise.all(
    status.accounts.map(async (account) => {
      const checked = health.get(account.id)
      let limit: z.infer<typeof limitSchema> | null = null
      try {
        const { data } = await client.instagram.getInstagramPublishingLimit({
          path: { accountId: account.id },
          ...via(fetcher),
        })
        limit = limitSchema.parse(data)
      } catch {
        // Unknown limit.
      }
      return {
        username: account.username,
        can_post: checked?.canPost ?? null,
        needs_reconnect: checked?.needsReconnect ?? null,
        issues: (checked?.issues ?? [])
          .slice(0, 3)
          .map((issue) => redact(issue, config))
          .filter(Boolean),
        posts_left: limit
          ? Math.max(0, limit.quotaTotal - limit.quotaUsage)
          : null,
        window_hours: limit?.quotaDurationSeconds
          ? Math.round(limit.quotaDurationSeconds / 3600)
          : null,
      }
    })
  )
  return { state: "connected", message: null, accounts }
}

/** What Tune stores on each post it makes, to preview and edit it later. */
const tuneSchema = z.object({
  v: z.literal(1),
  kind: z.enum(["feed", "story"]),
  fit: z.enum(["cover", "contain"]),
  photos: z.array(instagramPhotoSchema).min(1).max(10),
})

export type TunePostRecord = z.infer<typeof tuneSchema>

const targetSchema = z.object({
  platform: z.string(),
  accountId: z.union([z.string(), z.object({ _id: z.string() })]),
  platformPostUrl: z.string().nullish(),
  publishedAt: z.string().nullish(),
  errorMessage: z.string().nullish(),
  platformSpecificData: z
    .object({ contentType: z.string().nullish() })
    .nullish()
    .catch(null),
})

const postSchema = z.object({
  _id: z.string().regex(OBJECT_ID),
  status: z.string(),
  content: z.string().nullish(),
  scheduledFor: z.string().nullish(),
  mediaItems: z
    .array(
      z.object({
        type: z.string().nullish(),
        url: z.string().nullish(),
      })
    )
    .nullish(),
  platforms: z.array(targetSchema).nullish(),
  metadata: z
    .object({ tune: tuneSchema.optional().catch(undefined) })
    .nullish()
    .catch(null),
})

type ZernioPost = z.infer<typeof postSchema>

/** A post as the agent sees it: dates in store time, no provider payloads. */
export type InstagramPost = {
  id: string
  status: string
  kind: "feed" | "carousel" | "story" | "reel"
  account: string | null
  caption: string
  scheduled_for: string | null
  published_at: string | null
  url: string | null
  problem: string | null
  made_in_tune: boolean
  /** A draft or scheduled post Tune made for this site's account. */
  editable: boolean
  fit: InstagramFit | null
  photos: InstagramPhotoInput[] | null
}

const idOf = (value: string | { _id: string }) =>
  typeof value === "string" ? value : value._id

const storeTime = (value: string | null | undefined) =>
  value && !Number.isNaN(Date.parse(value)) ? toStoreDateTime(value) : null

/** Every target is Instagram, on an account this profile has connected. */
function isOwn(post: ZernioPost, accounts: InstagramAccount[]) {
  const ids = new Set(accounts.map((account) => account.id))
  const targets = post.platforms ?? []
  return (
    targets.length > 0 &&
    targets.every(
      (target) =>
        target.platform === "instagram" && ids.has(idOf(target.accountId))
    )
  )
}

function summarize(
  post: ZernioPost,
  accounts: InstagramAccount[],
  config: ZernioConfig
): InstagramPost {
  const names = new Map(
    accounts.map((account) => [account.id, account.username])
  )
  const target = post.platforms?.find(
    (item) => item.platform === "instagram" && names.has(idOf(item.accountId))
  )
  const media = post.mediaItems ?? []
  const tune = post.metadata?.tune
  const url = target?.platformPostUrl
  return {
    id: post._id,
    status: post.status,
    kind:
      target?.platformSpecificData?.contentType === "story"
        ? "story"
        : media.length > 1
          ? "carousel"
          : media[0]?.type === "video"
            ? "reel"
            : "feed",
    account: target ? (names.get(idOf(target.accountId)) ?? null) : null,
    caption: post.content ?? "",
    scheduled_for: storeTime(post.scheduledFor),
    published_at: storeTime(target?.publishedAt),
    url: url && INSTAGRAM_URL.test(url) ? url : null,
    problem: target?.errorMessage ? redact(target.errorMessage, config) : null,
    made_in_tune: Boolean(tune),
    editable:
      Boolean(tune) && isOwn(post, accounts) && EDITABLE.has(post.status),
    fit: tune?.fit ?? null,
    photos: tune?.photos ?? null,
  }
}

function parsePost(data: unknown) {
  return postSchema.parse(z.object({ post: z.unknown() }).parse(data).post)
}

export type InstagramListFilter = {
  status?: "draft" | "scheduled" | "published" | "failed"
  limit: number
}

/** This profile's Instagram posts: upcoming first when listing scheduled. */
export async function listInstagramPosts(
  config: ZernioConfig,
  { status, limit }: InstagramListFilter,
  fetcher: Fetcher = fetch
) {
  try {
    const accounts = await connectedInstagramAccounts(config, fetcher)
    const { data } = await sdk(config).posts.listPosts({
      query: {
        profileId: config.profileId,
        platform: "instagram",
        limit,
        sortBy: status === "scheduled" ? "scheduled-asc" : "created-desc",
        ...(status && { status }),
      },
      ...via(fetcher),
    })
    const listed = z
      .object({ posts: z.array(z.unknown()).default([]) })
      .parse(data)
    const posts = listed.posts.flatMap((raw) => {
      const post = postSchema.safeParse(raw)
      if (!post.success) return []
      const summary = summarize(post.data, accounts, config)
      // Only posts for this profile's own accounts.
      return summary.account ? [summary] : []
    })
    return {
      accounts: accounts.map((account) => account.username),
      posts,
    }
  } catch (error) {
    throw reword(error, config)
  }
}

/** One of this site's posts, with the media Zernio holds for it. */
export async function readInstagramPost(
  config: ZernioConfig,
  id: string,
  accounts: InstagramAccount[],
  fetcher: Fetcher = fetch
) {
  try {
    const { data } = await sdk(config).posts.getPost({
      path: { postId: id },
      ...via(fetcher),
    })
    const post = parsePost(data)
    if (!isOwn(post, accounts)) {
      throw new InstagramError(
        "Tune only changes posts made for this site's Instagram account; change that one in Zernio."
      )
    }
    return {
      summary: summarize(post, accounts, config),
      media: (post.mediaItems ?? []).flatMap((item) =>
        item.url?.startsWith("https://") ? [item.url] : []
      ),
      tune: post.metadata?.tune ?? null,
    }
  } catch (error) {
    throw reword(error, config)
  }
}

/** Uploads one finished JPEG to Zernio's storage and returns its URL. */
export async function uploadInstagramPhoto(
  config: ZernioConfig,
  jpeg: Uint8Array,
  name: string,
  fetcher: Fetcher = fetch
) {
  try {
    const { data } = await sdk(config).media.getMediaPresignedUrl({
      body: {
        filename: `${name}.jpg`,
        contentType: "image/jpeg",
        size: jpeg.byteLength,
      },
      ...via(fetcher),
    })
    const https = z.url({ protocol: /^https$/ })
    const { uploadUrl, publicUrl } = z
      .object({ uploadUrl: https, publicUrl: https })
      .parse(data)
    const response = await fetcher(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: new Uint8Array(jpeg),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    })
    if (!response.ok) {
      throw new InstagramError("Uploading a photo to Zernio failed. Try again.")
    }
    return publicUrl
  } catch (error) {
    throw reword(error, config)
  }
}

export type InstagramTiming =
  | { mode: "draft" }
  | { mode: "now" }
  /** An ISO instant, already checked to be within the next 7 days. */
  | { mode: "schedule"; at: string }

export type InstagramPostDraft = {
  accountId: string
  kind: InstagramKind
  caption: string
  /** Zernio media URLs, one per photo, in order. */
  media: { url: string; alt: string }[]
  timing: InstagramTiming
  record: Omit<TunePostRecord, "v">
}

function postBody(draft: InstagramPostDraft, update: boolean) {
  const story = draft.kind === "story"
  return {
    // An edit sends the caption even when empty, to clear it.
    ...(update || draft.caption ? { content: draft.caption } : {}),
    mediaItems: draft.media.map((item) => ({
      type: "image" as const,
      url: item.url,
      mimeType: "image/jpeg",
      // Instagram takes alt text on feed photos only.
      ...(!story && { altText: item.alt }),
    })),
    platforms: [
      {
        platform: "instagram",
        accountId: draft.accountId,
        ...(story && {
          platformSpecificData: { contentType: "story" as const },
        }),
      },
    ],
    timezone: STORE_TIME_ZONE,
    metadata: { tune: { v: 1, ...draft.record } },
    ...(draft.timing.mode === "draft"
      ? { isDraft: true }
      : draft.timing.mode === "now"
        ? { isDraft: false, publishNow: true }
        : { isDraft: false, scheduledFor: draft.timing.at }),
  }
}

const timeoutFor = (draft: InstagramPostDraft) =>
  draft.timing.mode === "now" ? PUBLISH_TIMEOUT_MS : READ_TIMEOUT_MS

/**
 * Creates a post. The idempotency key makes a retried call return the
 * original post; a post identical to one from the last 24 hours comes back
 * as that post, marked duplicate.
 */
export async function createInstagramPost(
  config: ZernioConfig,
  draft: InstagramPostDraft,
  accounts: InstagramAccount[],
  idempotencyKey: string,
  fetcher: Fetcher = fetch
): Promise<InstagramPost & { duplicate?: true }> {
  try {
    const { data } = await sdk(config, timeoutFor(draft)).posts.createPost({
      body: postBody(draft, false),
      headers: { "Idempotency-Key": idempotencyKey },
      ...via(fetcher),
    })
    return summarize(parsePost(data), accounts, config)
  } catch (error) {
    if (error instanceof ZernioApiError && error.statusCode === 409) {
      if (error.code === "idempotency_conflict") {
        throw new InstagramError(
          "Zernio is still processing this post. Check instagram__list_posts in a minute instead of saving it again."
        )
      }
      const existing = error.details?.existingPostId
      if (typeof existing === "string" && OBJECT_ID.test(existing)) {
        const { summary } = await readInstagramPost(
          config,
          existing,
          accounts,
          fetcher
        )
        return { ...summary, duplicate: true }
      }
      throw new InstagramError(
        "This exact post is already scheduled or was posted in the last 24 hours. Change the caption or photos to post it again."
      )
    }
    throw reword(error, config)
  }
}

/** Replaces a draft or scheduled post the caller already read and checked. */
export async function updateInstagramPost(
  config: ZernioConfig,
  id: string,
  draft: InstagramPostDraft,
  accounts: InstagramAccount[],
  fetcher: Fetcher = fetch
) {
  try {
    const { data } = await sdk(config, timeoutFor(draft)).posts.updatePost({
      path: { postId: id },
      body: postBody(draft, true),
      ...via(fetcher),
    })
    return summarize(parsePost(data), accounts, config)
  } catch (error) {
    throw reword(error, config)
  }
}

/** Deletes one of this site's unpublished posts from Zernio. */
export async function deleteInstagramPost(
  config: ZernioConfig,
  id: string,
  fetcher: Fetcher = fetch
) {
  try {
    const accounts = await connectedInstagramAccounts(config, fetcher)
    const { summary } = await readInstagramPost(config, id, accounts, fetcher)
    if (!DELETABLE.has(summary.status)) {
      throw new InstagramError(
        summary.status === "published"
          ? "That post is already on Instagram, and Zernio can't delete published Instagram posts; remove it in the Instagram app."
          : `A ${summary.status} post can't be deleted right now.`
      )
    }
    await sdk(config).posts.deletePost({
      path: { postId: id },
      ...via(fetcher),
    })
    return { deleted: true as const, id, status: summary.status }
  } catch (error) {
    throw reword(error, config)
  }
}

/** Publishes one of this site's failed posts again, right away. */
export async function retryInstagramPost(
  config: ZernioConfig,
  id: string,
  fetcher: Fetcher = fetch
) {
  try {
    const accounts = await connectedInstagramAccounts(config, fetcher)
    const { summary } = await readInstagramPost(config, id, accounts, fetcher)
    if (summary.status !== "failed" && summary.status !== "partial") {
      throw new InstagramError(
        `Only a failed post can be retried; this one is ${summary.status}.`
      )
    }
    const { data } = await sdk(config, PUBLISH_TIMEOUT_MS).posts.retryPost({
      path: { postId: id },
      ...via(fetcher),
    })
    const retried = z.object({ post: z.unknown().optional() }).parse(data)
    if (retried.post === undefined) {
      return (await readInstagramPost(config, id, accounts, fetcher)).summary
    }
    return summarize(postSchema.parse(retried.post), accounts, config)
  } catch (error) {
    throw reword(error, config)
  }
}
