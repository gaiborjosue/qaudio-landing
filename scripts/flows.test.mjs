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

const flows = await import("../lib/admin/flows.ts")
const sale = await import("../lib/admin/sale.ts")
const { sellingPrice } = await import("../lib/catalog.ts")
const { saleInputSchema, saleProposalSchema, productSaleSchema } =
  await import("../lib/admin/schemas.ts")
const { datesFromAnswer } = await import("../agent/lib/ask-dates.ts")

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`

test("sale prices come off MSRP or the regular price, rounded as asked", () => {
  const percent = { kind: "percent", percent: 25 }
  assert.equal(sale.discountedPrice(129900, percent), 97425)
  assert.equal(sale.discountedPrice(129900, percent, "dollar"), 97400)
  assert.equal(
    sale.discountedPrice(99950, { kind: "amount", cents: 10000 }),
    89950
  )
  assert.equal(
    sale.discountedPrice(100000, { kind: "percent", percent: 12.5 }),
    87500
  )

  const input = saleInputSchema.parse({
    title: "Paradigm Monitor SE",
    products: [
      // Off its list price.
      {
        id: id(1),
        name: "Monitor SE 3000F",
        price_cents: 99900,
        msrp_cents: 119900,
      },
      // No list price: off the regular price.
      {
        id: id(2),
        name: "Monitor SE Sub 8",
        price_cents: 79900,
        msrp_cents: null,
      },
      // Already discounted below 25% off its list price.
      {
        id: id(3),
        name: "Monitor SE Atmos",
        price_cents: 40000,
        msrp_cents: 59900,
      },
      // The owner's own price.
      {
        id: id(4),
        name: "Monitor SE 6000F",
        price_cents: 149900,
        msrp_cents: 179900,
        sale_price_cents: 129900,
      },
    ],
    discount: { kind: "percent", percent: 25 },
    starts_at: "now",
    ends_at: "2027-01-04T23:59",
  })
  // Defaults: off MSRP, to the cent.
  assert.equal(input.off, "msrp")
  assert.equal(input.rounding, "cent")
  const lines = sale.saleLines(input)
  assert.deepEqual(
    lines.map((line) => [
      line.base_cents,
      line.sale_price_cents,
      !!line.problem,
    ]),
    [
      [119900, 89925, false],
      [79900, 59925, false],
      [59900, 44925, true],
      [179900, 129900, false],
    ]
  )
  assert.equal(sale.saleDiscountLabel(input), "25% off MSRP")
  assert.equal(
    sale.saleDiscountLabel({
      ...input,
      off: "price",
      discount: { kind: "amount", cents: 5000 },
    }),
    "$50 off"
  )
  assert.equal(
    sale.saleDiscountLabel({ ...input, discount: null }),
    "Set prices"
  )
  assert.equal(
    sale.saleWindowLabel(input),
    "Now until Jan 4, 2027, 11:59\u00a0pm"
  )

  // A discount bigger than the price can't be a sale.
  const [free] = sale.saleLines({
    ...input,
    products: [input.products[1]],
    discount: { kind: "amount", cents: 90000 },
  })
  assert.match(free.problem, /more than its price/)
})

test("sale input is checked before it reaches a card", () => {
  const base = {
    title: "Sale",
    products: [{ id: id(1), name: "A", price_cents: 1000, msrp_cents: null }],
    discount: { kind: "percent", percent: 10 },
    starts_at: "now",
    ends_at: "2099-01-01T23:59",
  }
  assert.equal(saleInputSchema.safeParse(base).success, true)
  for (const change of [
    { discount: null },
    { starts_at: "2099-02-01T00:00" },
    { discount: { kind: "percent", percent: 100 } },
    { products: [base.products[0], base.products[0]] },
    { ends_at: "2099-01-01" },
  ])
    assert.equal(
      saleInputSchema.safeParse({ ...base, ...change }).success,
      false
    )
  // Every product priced by the owner needs no discount.
  assert.equal(
    saleInputSchema.safeParse({
      ...base,
      discount: null,
      products: [{ ...base.products[0], sale_price_cents: 900 }],
    }).success,
    true
  )
  // The tool also refuses a sale that has already ended; old cards still
  // render from the plain schema.
  const ended = { ...base, ends_at: "2020-01-01T23:59" }
  assert.equal(saleInputSchema.safeParse(ended).success, true)
  assert.equal(saleProposalSchema.safeParse(ended).success, false)
  assert.equal(
    productSaleSchema.safeParse({
      price_cents: 900,
      starts_at: "2099-02-01T00:00",
      ends_at: "2099-01-01T23:59",
    }).success,
    false
  )
})

test("the shop shows a sale price only inside its window", () => {
  const now = Date.parse("2026-11-05T12:00:00Z")
  const row = {
    price_cents: 99900,
    sale_price_cents: 74900,
    sale_starts_at: null,
    sale_ends_at: "2026-12-01T04:59:00Z",
  }
  assert.deepEqual(sellingPrice(row, now), {
    price_cents: 74900,
    sale: { regular_price_cents: 99900, ends_at: row.sale_ends_at },
  })
  const regular = { price_cents: 99900, sale: null }
  // Ended, not started yet, none, or no longer below the regular price.
  assert.deepEqual(
    sellingPrice({ ...row, sale_ends_at: "2026-11-05T11:59:00Z" }, now),
    regular
  )
  assert.deepEqual(
    sellingPrice({ ...row, sale_starts_at: "2026-11-06T05:00:00Z" }, now),
    regular
  )
  assert.deepEqual(
    sellingPrice({ ...row, sale_price_cents: null, sale_ends_at: null }, now),
    regular
  )
  assert.deepEqual(
    sellingPrice({ ...row, sale_price_cents: 99900 }, now),
    regular
  )
  // Started.
  assert.equal(
    sellingPrice({ ...row, sale_starts_at: "2026-11-05T11:00:00Z" }, now)
      .price_cents,
    74900
  )
  // How the admin lists it.
  const window = {
    price_cents: 74900,
    starts_at: "2026-11-10T00:00",
    ends_at: "2026-11-30T23:59",
  }
  assert.equal(
    sale.saleStatus(window, "2026-11-05T12:00"),
    "Sale $749 from Nov 10"
  )
  assert.equal(
    sale.saleStatus(window, "2026-11-12T12:00"),
    "Sale $749 until Nov 30"
  )
  assert.equal(sale.saleStatus(window, "2026-12-01T00:00"), "Sale ended Nov 30")
})

test("flows are on unless turned off, and only known ones count", () => {
  assert.deepEqual(flows.parseFlowSettings(null), {
    "product-sale": true,
    "news-instagram": true,
  })
  assert.deepEqual(
    flows.parseFlowSettings({
      "news-instagram": false,
      other: false,
      "product-sale": "no",
    }),
    { "product-sale": true, "news-instagram": false }
  )
  assert.deepEqual(
    flows.flowsFromClient({ flows: ["news-instagram", "nope"] }),
    ["news-instagram"]
  )
  assert.deepEqual(flows.flowsFromClient({ flows: [] }), [])
  for (const value of [
    undefined,
    null,
    "flows",
    ["product-sale"],
    { other: 1 },
  ])
    assert.equal(flows.flowsFromClient(value), null)
  assert.deepEqual(flows.flowsFromAttributes(undefined), [...flows.FLOW_IDS])
  assert.deepEqual(flows.flowsFromAttributes({ flows: [] }), [])
  assert.deepEqual(flows.flowsFromAttributes({ flows: "product-sale" }), [
    "product-sale",
  ])

  const on = flows.flowContext(["product-sale"])
  assert.match(on, /product-sale \(Product sale\): when /)
  assert.match(on, /Flows off: news-instagram/)
  assert.doesNotMatch(on, /news-instagram \(/)
  assert.match(flows.flowContext([]), /all off/)
  // Both on: the sale flow first, and the first listed wins.
  const both = flows.flowContext(["product-sale", "news-instagram"])
  assert.match(both, /the first listed wins/)
  assert.ok(both.indexOf("product-sale (") < both.indexOf("news-instagram ("))
  assert.match(
    both,
    /news-instagram .*isn't about a sale, discount, or promotion/
  )
})

test("a message about a sale is steered to the product-sale flow", () => {
  const all = ["product-sale", "news-instagram"]
  for (const text of [
    "generate a news for this sale I have",
    "Paradigm is 25% off until January",
    "We have a discount on the Monitor SE line",
    "Black Friday promo on turntables",
    "post a story about the clearance\nPhoto uploaded: uploads/a.webp (1×1)",
    "12.5 % off MSRP on Rega",
  ])
    assert.match(
      flows.flowHint(text, all),
      /starts the product-sale flow/,
      text
    )
  // News that isn't about a sale, QDeal's own word, and the lines the chat
  // adds for the agent don't count.
  for (const text of [
    "write a news post about our new listening room",
    "I want to create a deal.",
    'Save it as a draft.\nApproved as: {"when":"draft","photos":[{"alt":"25% off sale graphic"}]}',
    "Photo uploaded: uploads/sale-graphic.webp (1×1)",
  ])
    assert.equal(flows.flowHint(text, all), null, text)
  // With the sale flow off, a sale isn't news-instagram's either.
  assert.match(
    flows.flowHint("news for this sale", ["news-instagram"]),
    /don't start it/
  )
  assert.equal(flows.flowHint("news for this sale", []), null)
})

test("flow_progress input names the flow's own steps", () => {
  const parse = (input) => flows.flowProgressSchema.safeParse(input)
  assert.equal(parse({ flow: "product-sale" }).data.status, "active")
  assert.equal(parse({ flow: "product-sale", step: "prices" }).success, true)
  assert.equal(parse({ flow: "product-sale", step: "nope" }).success, false)
  assert.equal(parse({ flow: "news-instagram", step: "prices" }).success, false)
  assert.equal(
    parse({ flow: "product-sale", status: "skipped" }).success,
    false
  )
  assert.equal(parse({ flow: "other" }).success, false)
})

test("the stepper follows a flow run through the conversation", () => {
  const owner = (text = "Hi") => ({
    role: "user",
    parts: [{ type: "text", text }],
  })
  const call = (name, input, state = "completed") => ({
    role: "assistant",
    parts: [
      { type: "tool", name, callId: `${name}-${Math.random()}`, input, state },
    ],
  })
  const progress = (input, state) => call("flow_progress", input, state)
  const view = (...messages) => {
    const result = flows.flowState(messages)
    return (
      result && {
        status: result.status,
        steps: result.steps.map((step) => step.status),
      }
    )
  }

  assert.equal(view(owner()), null)
  assert.deepEqual(view(owner(), progress({ flow: "product-sale" })), {
    status: "active",
    steps: ["active", "pending", "pending", "pending", "pending", "pending"],
  })
  // The dates question is open, then answered; the news card waits.
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "product-sale" }),
      progress({ flow: "product-sale", step: "dates" }),
      call("ask_dates", { question: "When?" }, "completed"),
      progress({ flow: "product-sale", step: "news" }),
      call("news__save_news_post", {}, "approval")
    ),
    {
      status: "active",
      steps: ["done", "done", "waiting", "pending", "pending", "pending"],
    }
  )
  // A later step's card moves the stepper on even without a progress call,
  // and a skipped step stays skipped.
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "product-sale" }),
      progress({ flow: "product-sale", step: "prices", status: "skipped" }),
      call("news__save_news_post", {}, "completed"),
      call("design_story", { brief: "25% off" }, "blocked")
    ),
    {
      status: "active",
      steps: ["done", "done", "done", "skipped", "waiting", "pending"],
    }
  )
  // The story's design is picked; its card waits.
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "product-sale" }),
      progress({ flow: "product-sale", step: "prices", status: "skipped" }),
      call("news__save_news_post", {}, "completed"),
      call("design_story", { brief: "25% off" }, "completed"),
      call("instagram__save_post", {}, "approval")
    ),
    {
      status: "active",
      steps: ["done", "done", "done", "skipped", "done", "waiting"],
    }
  )
  // A denied card leaves its step under way for the next proposal.
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "news-instagram" }),
      call("news__save_news_post", {}, "rejected"),
      owner("Shorter title")
    ),
    { status: "active", steps: ["active", "pending"] }
  )
  // The last step saved finishes it; it stays until the owner moves on.
  const finished = [
    owner(),
    progress({ flow: "news-instagram" }),
    call("news__save_news_post", {}, "completed"),
    progress({ flow: "news-instagram", step: "instagram" }),
    call("instagram__save_post", {}, "completed"),
  ]
  assert.deepEqual(view(...finished), {
    status: "done",
    steps: ["done", "done"],
  })
  assert.equal(view(...finished, owner("Thanks")), null)
  // Stopped, refused (flow off), or never started: nothing to show.
  assert.equal(
    view(
      owner(),
      progress({ flow: "product-sale" }),
      progress({ flow: "product-sale", status: "stopped" })
    ),
    null
  )
  assert.equal(
    view(owner(), progress({ flow: "product-sale" }, "failed")),
    null
  )
  assert.equal(
    view(owner(), call("news__save_news_post", {}, "approval")),
    null
  )
  // A new flow replaces the one before; older calls under original names count.
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "product-sale" }),
      owner("Actually just a news post"),
      progress({ flow: "news-instagram" }),
      call("save_news_post", {}, "approval")
    ),
    { status: "active", steps: ["waiting", "pending"] }
  )
})

test("ask_dates reads the calendar's answer, or passes typing through", () => {
  assert.deepEqual(
    datesFromAnswer({ status: "answered", text: "now/2027-01-04T23:59" }),
    { status: "answered", starts_at: "now", ends_at: "2027-01-04T23:59" }
  )
  assert.deepEqual(
    datesFromAnswer({
      status: "answered",
      text: "2026-11-10T00:00/2026-11-30T23:59",
    }),
    {
      status: "answered",
      starts_at: "2026-11-10T00:00",
      ends_at: "2026-11-30T23:59",
    }
  )
  // Backwards, or typed words: the model reads them itself.
  assert.deepEqual(
    datesFromAnswer({
      status: "answered",
      text: "2026-12-10T00:00/2026-11-30T23:59",
    }),
    { status: "answered", answer: "2026-12-10T00:00/2026-11-30T23:59" }
  )
  assert.deepEqual(
    datesFromAnswer({ status: "answered", text: " until Jan 4 " }),
    {
      status: "answered",
      answer: "until Jan 4",
    }
  )
  assert.deepEqual(datesFromAnswer({ status: "cancelled" }), {
    interrupted: true,
  })
  assert.deepEqual(datesFromAnswer({ status: "unavailable" }), {
    status: "unavailable",
  })
})
