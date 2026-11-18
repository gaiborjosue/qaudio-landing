import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { registerHooks } from "node:module"
import test from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

// The app's TypeScript imports its siblings without extensions; resolve
// those to .ts so Node can load (and strip types from) the real modules.
registerHooks({
  resolve(specifier, context, next) {
    if (
      specifier.startsWith(".") &&
      context.parentURL?.endsWith(".ts") &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      const candidate = fileURLToPath(
        new URL(`${specifier}.ts`, context.parentURL)
      )
      if (existsSync(candidate))
        return { url: pathToFileURL(candidate).href, shortCircuit: true }
    }
    return next(specifier, context)
  },
})

const { designingStory, plainLine, sentPosts, turnSummary, waitingFor } =
  await import("../lib/admin/chat-notices.ts")

const NOW = "2026-11-17T10:00"
const user = (text) => ({ role: "user", parts: [{ type: "text", text }] })
const reply = (...parts) => ({ role: "assistant", parts })
const ask = (id, prompt, extra = {}) => ({
  interactionId: id,
  status: "open",
  request: { prompt, ...extra },
})

test("an unanswered change card is what the chat waits for", () => {
  const messages = [
    user("Post this weekend's hours"),
    reply({
      type: "tool",
      name: "hours__save_hours_change",
      callId: "call-1",
      state: "approval",
      label: "Saving hours",
      input: {},
      interaction: ask("int-1", "Save Saturday's hours?"),
    }),
  ]
  assert.deepEqual(waitingFor(messages), {
    kind: "approval",
    id: "int-1",
    title: "Save Saturday's hours?",
  })
})

test("answered questions wait for nothing; open questions are told apart", () => {
  const answered = {
    ...ask("int-1", "Save it?"),
    answer: { optionId: "approve" },
  }
  assert.equal(
    waitingFor([
      reply({
        type: "tool",
        name: "hours__save_hours_change",
        callId: "call-1",
        interaction: answered,
      }),
    ]),
    null
  )
  assert.deepEqual(
    waitingFor([
      reply({
        type: "interaction",
        ...ask("int-2", "Which dates?", { title: "Pick the dates" }),
      }),
    ]),
    { kind: "question", id: "int-2", title: "Pick the dates" }
  )
  assert.deepEqual(
    waitingFor([
      reply({
        type: "tool",
        name: "design_story",
        callId: "call-3",
        state: "approval",
        output: { review: "waiting", images: [{ path: "a.jpg" }] },
        interaction: ask("int-3", "Continue?"),
      }),
    ]),
    { kind: "story", id: "int-3", title: "Story design ready" }
  )
})

test("a story is designing until its call ends or makes an image", () => {
  const story = (state, output) =>
    reply({ type: "tool", name: "edit_story", callId: "s", state, output })
  assert.deepEqual(designingStory([story("running", {})]), {
    id: "s",
    editing: true,
  })
  assert.equal(
    designingStory([story("running", { images: [{ path: "a.jpg" }] })]),
    null
  )
  assert.equal(designingStory([story("failed", {})]), null)
  assert.equal(designingStory([user("Hi")]), null)
})

test("a turn's summary is its saved changes, or the start of its reply", () => {
  const news = {
    type: "tool",
    name: "news__save_news_post",
    callId: "n",
    state: "completed",
    label: "Saved the post",
    input: { title: "Holiday hours", status: "draft" },
    output: { status: "draft" },
  }
  assert.equal(
    turnSummary([user("Draft it"), reply(news)], NOW),
    "Saved “Holiday hours” as a draft."
  )
  assert.equal(
    turnSummary(
      [
        user("Old"),
        reply(news),
        user("How many products are on sale?"),
        reply({
          type: "text",
          text: "**Three** products are on sale:\n\n- [Paradigm](/products/p)",
        }),
      ],
      NOW
    ),
    "Three products are on sale: Paradigm"
  )
})

test("plain lines drop Markdown and fit a toast", () => {
  assert.equal(plainLine("# Done\n> `ok`"), "Done ok")
  const long = plainLine("word ".repeat(60), 20)
  assert.equal(long.length <= 20, true)
  assert.equal(long.endsWith("…"), true)
})

test("only Instagram and Google posts that went out are sent posts", () => {
  const posts = sentPosts(
    [
      reply(
        {
          type: "tool",
          name: "instagram__save_post",
          callId: "ig",
          state: "completed",
          label: "Posted",
          input: {
            kind: "story",
            photos: [
              {
                path: "instagram/a.webp",
                width: 1080,
                height: 1920,
                alt: "Sale",
              },
            ],
            caption: "",
            when: "now",
          },
          output: {},
        },
        {
          type: "tool",
          name: "googlebusiness__save_post",
          callId: "gb",
          state: "running",
          input: {},
        },
        {
          type: "tool",
          name: "news__save_news_post",
          callId: "n",
          state: "completed",
          input: {},
        }
      ),
    ],
    NOW
  )
  assert.deepEqual(
    posts.map((post) => post.id),
    ["ig"]
  )
  assert.equal(posts[0].title, "Posted the story to Instagram")
})
