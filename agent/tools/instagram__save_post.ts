import { defineTool } from "eve/tools"
import { always } from "eve/tools/approval"
import {
  instagramFrame,
  instagramScheduleProblem,
} from "../../lib/admin/instagram"
import {
  connectedInstagramAccounts,
  createInstagramPost,
  InstagramError,
  pickInstagramAccount,
  readInstagramPost,
  updateInstagramPost,
  type InstagramTiming,
} from "../../lib/admin/instagram-posts"
import {
  instagramPostProposalSchema,
  type InstagramPostInput,
} from "../../lib/admin/schemas"
import {
  formatStoreDateTime,
  fromStoreDateTime,
} from "../../lib/admin/store-time"
import {
  idempotencyKey,
  instagramAccess,
  uploadInstagramPhotos,
} from "../lib/instagram"
import { placeUploads } from "../lib/media"
import { callerSupabase } from "../lib/supabase"

const noun = ({ kind, photos }: InstagramPostInput) =>
  kind === "story" ? "story" : photos.length > 1 ? "carousel" : "post"

export default defineTool({
  deferred: true,
  description:
    "Add an Instagram post (one photo, a carousel of 2–10, or a story), or change a draft or scheduled one by id. Send the complete post. Photos come from the media library (attached uploads/ photos, or a product's or news post's saved photos); each is converted to the JPEG Instagram takes and fitted to the post's frame. The owner sees the post as Instagram will show it and must approve: a draft stays in Zernio, now posts at once, and a store time schedules it up to 7 days ahead.",
  inputSchema: instagramPostProposalSchema,
  approval: {
    request: always(),
    prompt: ({ input }) => {
      if (input.id) return `Save changes to this Instagram ${noun(input)}?`
      if (input.when === "draft") {
        return `Save this Instagram ${noun(input)} as a draft?`
      }
      if (input.when === "now")
        return `Post this ${noun(input)} to Instagram now?`
      return `Schedule this Instagram ${noun(input)} for ${formatStoreDateTime(input.when)}?`
    },
  },
  label: {
    start: (input) =>
      input.id
        ? `Update the Instagram ${noun(input)}`
        : `Add an Instagram ${noun(input)}`,
    complete: (input) => `Saved the Instagram ${noun(input)}`,
  },
  async execute(input, ctx) {
    const config = await instagramAccess(ctx)
    const accounts = await connectedInstagramAccounts(config)
    const account = pickInstagramAccount(accounts, input.account)

    // Checked again here: time passes while the card waits for approval.
    let timing: InstagramTiming
    if (input.when === "draft" || input.when === "now") {
      timing = { mode: input.when }
    } else {
      const problem = instagramScheduleProblem(input.when)
      if (problem) {
        throw new InstagramError(`${problem} Ask the owner for a new time.`)
      }
      timing = { mode: "schedule", at: fromStoreDateTime(input.when) }
    }

    const existing = input.id
      ? await readInstagramPost(config, input.id, accounts)
      : null
    if (existing) {
      const { summary, tune } = existing
      if (!tune) {
        throw new InstagramError(
          "That post wasn't made in Tune, so change it in Zernio."
        )
      }
      if (!summary.editable) {
        throw new InstagramError(
          summary.status === "failed"
            ? "A failed post can't be changed. Retry it with instagram__retry_post, or delete it and make a new one."
            : `A ${summary.status} post can't be changed.`
        )
      }
      if (tune.kind !== input.kind || summary.account !== account.username) {
        throw new InstagramError(
          "A post can't switch between feed and story, or to another account. Delete it and make a new one."
        )
      }
    }

    // Keep attached photos: copy uploads/ into instagram/, as news does.
    const place = await placeUploads(
      callerSupabase(ctx),
      input.photos.map((photo) => photo.path),
      "instagram"
    )
    const photos = input.photos.map((photo) => ({
      ...photo,
      path: place(photo.path),
    }))
    const frame = instagramFrame(input.kind, input.fit, photos[0])

    // An edit that keeps the same photos and fit reuses the uploaded ones.
    const tune = existing?.tune
    const reuse =
      existing && tune && existing.media.length === photos.length
        ? tune.fit === frame.fit &&
          tune.photos.length === photos.length &&
          tune.photos.every((photo, index) => photo.path === photos[index].path)
          ? existing.media
          : null
        : null
    const urls = reuse ?? (await uploadInstagramPhotos(config, photos, frame))

    const draft = {
      accountId: account.id,
      kind: input.kind,
      caption: input.kind === "story" ? "" : input.caption.trim(),
      media: photos.map((photo, index) => ({
        url: urls[index],
        alt: photo.alt,
      })),
      timing,
      record: { kind: input.kind, fit: frame.fit, photos },
    }
    const saved = input.id
      ? await updateInstagramPost(config, input.id, draft, accounts)
      : await createInstagramPost(config, draft, accounts, idempotencyKey(ctx))

    if (
      timing.mode === "now" &&
      (saved.status === "failed" || saved.status === "partial")
    ) {
      throw new InstagramError(
        `Saved in Zernio, but Instagram didn't publish it${saved.problem ? `: ${saved.problem}` : "."} Once that's fixed, retry it with instagram__retry_post (id ${saved.id}), or delete it.`
      )
    }
    return {
      saved: true,
      id: saved.id,
      status: saved.status,
      kind: saved.kind,
      account: saved.account,
      scheduled_for: saved.scheduled_for,
      // The Instagram post, once it's live.
      url: saved.url,
      ...("duplicate" in saved && {
        duplicate:
          "This exact post was already in Zernio; that existing post is returned.",
      }),
      // Saved photo paths; use these (not uploads/) in later edits.
      photos: photos.map((photo) => photo.path),
      fit: frame.fit,
    }
  },
})
