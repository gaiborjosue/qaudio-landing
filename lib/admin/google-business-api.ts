import { createHash } from "node:crypto"
import Zernio, {
  type UpdateGoogleBusinessLocationDetailsData,
} from "@zernio/node"
import { z } from "zod"
import { addDays, STORE_TIME_ZONE, WEEKDAYS } from "../store-hours"
import { fromStoreDateTime, toStoreDateTime } from "./store-time"
import type { GoogleBusinessStatus } from "./google-business-types"
import type { ZernioConfig } from "./zernio-api"
import type {
  GoogleBusinessHoursInput,
  GoogleBusinessPostInput,
  GoogleBusinessTarget,
} from "./schemas"
import { instagramPhotoSchema } from "./schemas"

type Fetcher = typeof fetch
const via = (fetcher: Fetcher) => ({
  fetch: fetcher,
  cache: "no-store" as const,
  redirect: "error" as const,
})
const client = (config: ZernioConfig, timeout = 20_000) =>
  new Zernio({ apiKey: config.apiKey, timeout })
const id = z.string().regex(/^[a-f0-9]{24}$/i)
const profile = z.union([z.string(), z.object({ _id: z.string() })])
const accountSchema = z.object({
  _id: id,
  profileId: profile,
  platform: z.string(),
  isActive: z.boolean(),
  enabled: z.boolean().optional(),
  needsReconnection: z.boolean().optional(),
  displayName: z.string().max(300).optional(),
  username: z.string().max(300).optional(),
})

export class GoogleBusinessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "GoogleBusinessError"
  }
}

/** Never echo provider errors: they can contain credentials and payloads. */
async function safe<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work()
  } catch (error) {
    if (error instanceof GoogleBusinessError) throw error
    throw new GoogleBusinessError(
      "Google Business couldn't complete that request. Check its connection and read the current hours or posts before trying again; a write may have gone through."
    )
  }
}

/** No live writes in development, even if the production opt-in is present. */
export function googleBusinessWritesEnabled(
  env: Record<string, string | undefined> = process.env
) {
  return (
    env.NODE_ENV === "production" &&
    env.ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED === "true"
  )
}

export function assertGoogleBusinessWrites(
  env: Record<string, string | undefined> = process.env
) {
  if (!googleBusinessWritesEnabled(env)) {
    throw new GoogleBusinessError(
      "Google Business is read-only. Writes require production and ZERNIO_GOOGLE_BUSINESS_WRITES_ENABLED=true. No change was sent."
    )
  }
}

export async function zernioGoogleBusinessStatus(
  config: ZernioConfig | null,
  fetcher: Fetcher = fetch
): Promise<GoogleBusinessStatus> {
  if (!config)
    return {
      state: "unconfigured",
      accounts: [],
      connectUrl: null,
      message: "Google Business connection isn't configured.",
    }
  try {
    const { data } = await client(config).accounts.listAccounts({
      query: {
        profileId: config.profileId,
        platform: "googlebusiness",
        excludeHidden: true,
      },
      ...via(fetcher),
    })
    const own = z
      .object({ accounts: z.array(accountSchema) })
      .parse(data)
      .accounts.filter(
        (a) =>
          a.platform === "googlebusiness" &&
          (typeof a.profileId === "string" ? a.profileId : a.profileId._id) ===
            config.profileId &&
          a.enabled !== false
      )
    const accounts = own
      .filter((a) => a.isActive && !a.needsReconnection)
      .map((a) => ({
        id: a._id,
        name: a.displayName || a.username || "Google Business Profile",
      }))
    const needsAttention = own.some((a) => !a.isActive || a.needsReconnection)
    return {
      state: accounts.length
        ? "connected"
        : needsAttention
          ? "reconnect"
          : "disconnected",
      accounts,
      connectUrl: "https://zernio.com",
      ...(needsAttention && { needsAttention: true }),
      ...(!accounts.length || needsAttention
        ? { message: "Check Google Business connections in Zernio." }
        : {}),
    }
  } catch {
    return {
      state: "unavailable",
      accounts: [],
      connectUrl: "https://zernio.com",
      message: "Google Business connection could not be checked. Try again.",
    }
  }
}

async function ownAccount(
  config: ZernioConfig,
  accountId: string,
  fetcher: Fetcher
) {
  const status = await zernioGoogleBusinessStatus(config, fetcher)
  const account = status.accounts.find((a) => a.id === accountId)
  if (!account)
    throw new GoogleBusinessError(
      "That Google Business account isn't connected to this site's configured Zernio profile. Read googlebusiness__get_account."
    )
  return account
}

const googleDate = z.object({
  year: z.int().min(1).max(9999),
  month: z.int().min(1).max(12),
  day: z.int().min(1).max(31),
})
// The live Business Information API uses TimeOfDay objects (including {} at
// midnight); Zernio's pinned SDK still declares the older HH:MM strings.
// Accept both on reads, preserving every known field on untouched periods.
const googleTime = z.union([
  z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/),
  z.object({
    hours: z.int().min(0).max(24).optional(),
    minutes: z.int().min(0).max(59).optional(),
    seconds: z.int().min(0).max(59).optional(),
    nanos: z.int().min(0).max(999_999_999).optional(),
  }),
])
const timeParts = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number)
  return { hours, minutes }
}
const period = z.object({
  openDay: z.string(),
  openTime: googleTime,
  closeDay: z.string(),
  closeTime: googleTime,
})
const specialPeriod = z.object({
  startDate: googleDate,
  endDate: googleDate.optional(),
  openTime: googleTime.optional(),
  closeTime: googleTime.optional(),
  closed: z.boolean().optional(),
})
const detailsSchema = z.object({
  locationId: z.string().regex(/^(?:locations\/)?\d+$/),
  title: z.string().min(1).max(300),
  regularHours: z.object({ periods: z.array(period).default([]) }).optional(),
  specialHours: z
    .object({ specialHourPeriods: z.array(specialPeriod).default([]) })
    .optional(),
  location: z.object({ isVerified: z.boolean().optional() }).nullish(),
})
const locationId = (value: string) =>
  `locations/${value.replace(/^locations\//, "")}`
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
export const googleBusinessRevision = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex")

/** Selected location only. Never offer other locations managed by the OAuth grant. */
export async function readGoogleBusinessLocation(
  config: ZernioConfig,
  accountId: string,
  fetcher: Fetcher = fetch
) {
  return safe(async () => {
    await ownAccount(config, accountId, fetcher)
    const { data } = await client(
      config
    ).gmblocationdetails.getGoogleBusinessLocationDetails({
      path: { accountId },
      query: { readMask: "title,regularHours,specialHours,metadata" },
      ...via(fetcher),
    })
    const details = detailsSchema.parse(data)
    const hours = {
      regularHours: details.regularHours ?? { periods: [] },
      specialHours: details.specialHours ?? { specialHourPeriods: [] },
    }
    return {
      target: {
        account_id: accountId,
        location_id: locationId(details.locationId),
        business: details.title,
      },
      time_zone: STORE_TIME_ZONE,
      verified: details.location?.isVerified ?? null,
      hours,
      revision: googleBusinessRevision(hours),
    }
  })
}

async function checkTarget(
  config: ZernioConfig,
  target: GoogleBusinessTarget,
  fetcher: Fetcher
) {
  const current = await readGoogleBusinessLocation(
    config,
    target.account_id,
    fetcher
  )
  if (
    current.target.location_id !== target.location_id ||
    current.target.business !== target.business
  )
    throw new GoogleBusinessError(
      "The selected Google Business location changed. Read googlebusiness__get_location and propose again."
    )
  return current
}

const dateKey = (date: z.infer<typeof googleDate>) =>
  `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`
const dateParts = (date: string) => {
  const [year, month, day] = date.split("-").map(Number)
  return { year, month, day }
}

/** Preserve every Google special-hours period outside the approved ranges. */
export function googleBusinessHoursBody(
  hours: Awaited<ReturnType<typeof readGoogleBusinessLocation>>["hours"],
  input: GoogleBusinessHoursInput
) {
  const body: {
    updateMask: string
    regularHours?: { periods: z.infer<typeof period>[] }
    specialHours?: { specialHourPeriods: z.infer<typeof specialPeriod>[] }
  } = { updateMask: "" }
  const masks: string[] = []
  if (input.week) {
    masks.push("regularHours")
    body.regularHours = {
      periods: input.week.flatMap((day, index) =>
        day.kind === "open"
          ? [
              {
                openDay: WEEKDAYS[index].toUpperCase(),
                closeDay: WEEKDAYS[index].toUpperCase(),
                openTime: timeParts(day.opens_at!),
                closeTime: timeParts(day.closes_at!),
              },
            ]
          : []
      ),
    }
  }
  if (input.changes.length) {
    masks.push("specialHours")
    let periods = [...hours.specialHours.specialHourPeriods]
    for (const change of input.changes) {
      periods = periods.filter((p) => {
        const start = dateKey(p.startDate),
          end = dateKey(p.endDate ?? p.startDate)
        if (end < change.starts_on || start > change.ends_on) return true
        if (start < change.starts_on || end > change.ends_on)
          throw new GoogleBusinessError(
            "A Google hours period crosses the requested dates. Include its whole range in a new proposal so neighboring hours aren't lost."
          )
        return false
      })
      if (change.kind === "regular") continue
      for (
        let day = change.starts_on;
        day <= change.ends_on;
        day = addDays(day, 1)
      ) {
        periods.push({
          startDate: dateParts(day),
          endDate: dateParts(day),
          ...(change.kind === "closed"
            ? { closed: true }
            : {
                openTime: timeParts(change.opens_at!),
                closeTime: timeParts(change.closes_at!),
                closed: false,
              }),
        })
      }
    }
    body.specialHours = {
      specialHourPeriods: periods.map((p) => ({
        ...p,
        ...(typeof p.openTime === "string" && {
          openTime: timeParts(p.openTime),
        }),
        ...(typeof p.closeTime === "string" && {
          closeTime: timeParts(p.closeTime),
        }),
      })),
    }
  }
  body.updateMask = masks.join(",")
  return body
}

export async function setGoogleBusinessHours(
  config: ZernioConfig,
  input: GoogleBusinessHoursInput,
  key: string,
  fetcher: Fetcher = fetch
) {
  assertGoogleBusinessWrites()
  return safe(async () => {
    const current = await checkTarget(config, input.target, fetcher)
    if (current.revision !== input.revision)
      throw new GoogleBusinessError(
        "Google hours changed since the preview. Read googlebusiness__get_location and propose again."
      )
    const { data } = await client(
      config
    ).gmblocationdetails.updateGoogleBusinessLocationDetails({
      path: { accountId: input.target.account_id },
      query: { locationId: input.target.location_id },
      // Native Google TimeOfDay JSON, as observed in GET and documented by
      // Business Information v1. The pinned SDK's string-only type is stale.
      body: googleBusinessHoursBody(
        current.hours,
        input
      ) as unknown as UpdateGoogleBusinessLocationDetailsData["body"],
      headers: { "Idempotency-Key": key },
      ...via(fetcher),
    })
    z.object({ success: z.literal(true) }).parse(data)
    return {
      saved: true,
      business: input.target.business,
      destination: "Google Business Profile",
    }
  })
}

const cta = z.object({ type: z.string(), url: z.string() })
const postTarget = z.object({
  platform: z.string(),
  accountId: z.union([z.string(), z.object({ _id: z.string() })]),
  platformSpecificData: z
    .object({
      locationId: z.string().optional(),
      topicType: z.string().optional(),
      callToAction: cta.optional(),
    })
    .nullish(),
})
const postSchema = z.object({
  _id: id,
  status: z.string(),
  content: z.string().nullish(),
  scheduledFor: z.string().nullish(),
  mediaItems: z
    .array(z.object({ type: z.string(), url: z.string() }))
    .nullish(),
  platforms: z.array(postTarget),
  metadata: z
    .object({
      tuneGoogleBusiness: z
        .object({
          v: z.literal(1),
          target: z.object({
            account_id: id,
            location_id: z.string(),
            business: z.string(),
          }),
          photo: instagramPhotoSchema.optional(),
        })
        .optional(),
    })
    .nullish(),
})
type GooglePost = z.infer<typeof postSchema>
const accountIdOf = (value: string | { _id: string }) =>
  typeof value === "string" ? value : value._id
function ownsPost(post: GooglePost, target: GoogleBusinessTarget) {
  return (
    post.platforms.length === 1 &&
    post.platforms.every(
      (p) =>
        p.platform === "googlebusiness" &&
        accountIdOf(p.accountId) === target.account_id &&
        p.platformSpecificData?.locationId === target.location_id
    )
  )
}
function summarizePost(post: GooglePost, target: GoogleBusinessTarget) {
  return {
    id: post._id,
    status: post.status,
    content: post.content ?? "",
    scheduled_for:
      post.scheduledFor && !Number.isNaN(Date.parse(post.scheduledFor))
        ? toStoreDateTime(post.scheduledFor)
        : null,
    revision: googleBusinessRevision(post),
    editable:
      Boolean(post.metadata?.tuneGoogleBusiness) &&
      canonical(post.metadata?.tuneGoogleBusiness?.target) ===
        canonical(target) &&
      ["draft", "scheduled"].includes(post.status),
    photo: post.metadata?.tuneGoogleBusiness?.photo ?? null,
    call_to_action:
      post.platforms[0]?.platformSpecificData?.callToAction ?? null,
  }
}
async function readPost(
  config: ZernioConfig,
  target: GoogleBusinessTarget,
  postId: string,
  fetcher: Fetcher
) {
  const { data } = await client(config).posts.getPost({
    path: { postId },
    ...via(fetcher),
  })
  const post = z.object({ post: postSchema }).parse(data).post
  if (
    !ownsPost(post, target) ||
    !post.metadata?.tuneGoogleBusiness ||
    canonical(post.metadata.tuneGoogleBusiness.target) !== canonical(target)
  )
    throw new GoogleBusinessError(
      "Tune only changes its own Google Business posts for this exact location. Manage that post in Zernio."
    )
  return post
}

export async function listGoogleBusinessPosts(
  config: ZernioConfig,
  target: GoogleBusinessTarget,
  status: "draft" | "scheduled" | "published" | "failed" | undefined,
  limit: number,
  fetcher: Fetcher = fetch
) {
  return safe(async () => {
    await checkTarget(config, target, fetcher)
    const { data } = await client(config).posts.listPosts({
      query: {
        profileId: config.profileId,
        platform: "googlebusiness",
        limit,
        ...(status && { status }),
        sortBy: status === "scheduled" ? "scheduled-asc" : "created-desc",
      },
      ...via(fetcher),
    })
    return {
      posts: z
        .object({ posts: z.array(z.unknown()) })
        .parse(data)
        .posts.flatMap((raw) => {
          const post = postSchema.safeParse(raw)
          return post.success && ownsPost(post.data, target)
            ? [summarizePost(post.data, target)]
            : []
        }),
    }
  })
}

export function googleBusinessScheduleProblem(when: string, now = Date.now()) {
  if (when === "now" || when === "draft") return null
  const at = Date.parse(fromStoreDateTime(when))
  return !Number.isFinite(at) || at < now + 120_000 || at > now + 7 * 86_400_000
    ? "Choose a Google Business post time from two minutes to seven days ahead."
    : null
}

/** Preflight before uploads, and again immediately before the provider write. */
export async function prepareGoogleBusinessPost(
  config: ZernioConfig,
  input: GoogleBusinessPostInput,
  fetcher: Fetcher = fetch
) {
  assertGoogleBusinessWrites()
  return safe(async () => {
    const current = await checkTarget(config, input.target, fetcher)
    if (current.verified === false)
      throw new GoogleBusinessError(
        "Google Business is not verified. Resolve verification in Zernio or Google before creating a post."
      )
    const problem = googleBusinessScheduleProblem(input.when)
    if (problem) throw new GoogleBusinessError(problem)
    if (input.id) {
      const existing = await readPost(config, input.target, input.id, fetcher)
      if (
        googleBusinessRevision(existing) !== input.revision ||
        !["draft", "scheduled"].includes(existing.status)
      )
        throw new GoogleBusinessError(
          "That Google Business post changed or is no longer editable. List posts and propose again."
        )
    }
  })
}

/** Photo URLs are produced by the approved agent upload, never model-supplied. */
export async function saveGoogleBusinessPost(
  config: ZernioConfig,
  input: GoogleBusinessPostInput,
  key: string,
  mediaUrl: string | null = null,
  fetcher: Fetcher = fetch
) {
  assertGoogleBusinessWrites()
  return safe(async () => {
    await prepareGoogleBusinessPost(config, input, fetcher)
    const body = {
      content: input.content,
      mediaItems: mediaUrl
        ? [{ type: "image" as const, url: mediaUrl, mimeType: "image/jpeg" }]
        : [],
      platforms: [
        {
          platform: "googlebusiness",
          accountId: input.target.account_id,
          platformSpecificData: {
            locationId: input.target.location_id,
            topicType: "STANDARD",
            ...(input.call_to_action && { callToAction: input.call_to_action }),
          },
        },
      ],
      timezone: STORE_TIME_ZONE,
      metadata: {
        tuneGoogleBusiness: {
          v: 1,
          target: input.target,
          ...(input.photo && { photo: input.photo }),
        },
      },
      ...(input.when === "draft"
        ? { isDraft: true }
        : input.when === "now"
          ? { isDraft: false, publishNow: true }
          : { isDraft: false, scheduledFor: fromStoreDateTime(input.when) }),
    }
    const options = {
      body,
      headers: { "Idempotency-Key": key },
      ...via(fetcher),
    }
    const { data } = input.id
      ? await client(config, 240_000).posts.updatePost({
          path: { postId: input.id },
          ...options,
        })
      : await client(config, 240_000).posts.createPost(options)
    const post = z.object({ post: postSchema }).parse(data).post
    if (!ownsPost(post, input.target))
      throw new GoogleBusinessError(
        "Zernio returned an unexpected post target. Check posts in Zernio before trying again."
      )
    if (["failed", "partial"].includes(post.status))
      throw new GoogleBusinessError(
        `Google did not publish post ${post._id}. The record is ${post.status} in Zernio. Inspect it there before trying again.`
      )
    return {
      saved: true,
      ...summarizePost(post, input.target),
      live: post.status === "published",
    }
  })
}

export async function deleteGoogleBusinessPost(
  config: ZernioConfig,
  input: { target: GoogleBusinessTarget; id: string; revision: string },
  key: string,
  fetcher: Fetcher = fetch
) {
  assertGoogleBusinessWrites()
  return safe(async () => {
    await checkTarget(config, input.target, fetcher)
    const existing = await readPost(config, input.target, input.id, fetcher)
    if (
      googleBusinessRevision(existing) !== input.revision ||
      !["draft", "scheduled", "failed", "cancelled"].includes(existing.status)
    )
      throw new GoogleBusinessError(
        "That post changed or can't be deleted here. List posts again; remove published posts in Google Business."
      )
    await client(config).posts.deletePost({
      path: { postId: input.id },
      headers: { "Idempotency-Key": key },
      ...via(fetcher),
    })
    return { removed: true, id: input.id }
  })
}
