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
const { sellingPrice, priceQualifications, conditionQualification } =
  await import("../lib/catalog.ts")
const { valuesFrom, inputFromValues } =
  await import("../lib/admin/product-editor.ts")
const {
  conditionNotes,
  conditionScore,
  withConditionNotes,
  withConditionScore,
} = await import("../lib/admin/condition-score.ts")
const { byName } = await import("../lib/admin/alphabetical.ts")
const { saleInputSchema, saleProposalSchema, productSaleSchema } =
  await import("../lib/admin/schemas.ts")
const { datesFromAnswer } = await import("../agent/lib/ask-dates.ts")

const { calendarDay, storeDay, saleDatesFromRange } =
  await import("../lib/admin/sale-dates.ts")
const { NO_PRODUCT_FILTERS, productFiltersFromQuery, productFiltersHref } =
  await import("../lib/admin/product-filters.ts")

const id = (n) => `00000000-0000-4000-8000-00000000000${n}`

test("metadata product links round-trip only supported filters, including escaped values", () => {
  for (const facet of ["category", "brand"]) {
    const filters = { ...NO_PRODUCT_FILTERS, [facet]: "a&b / hi-fi" }
    const url = new URL(productFiltersHref(filters), "https://qaudio.test")
    assert.equal(url.pathname, "/admin/products")
    assert.equal(url.searchParams.get(facet), "a&b / hi-fi")
    assert.deepEqual(productFiltersFromQuery(url.searchParams), filters)
  }
  assert.equal(productFiltersHref(NO_PRODUCT_FILTERS), "/admin/products")
  assert.deepEqual(
    productFiltersFromQuery(new URLSearchParams("other=ignored")),
    NO_PRODUCT_FILTERS
  )
  const all = {
    search: "KEF R3",
    category: "speakers",
    brand: "kef",
    condition: "Demo",
    status: "draft",
  }
  assert.deepEqual(
    productFiltersFromQuery(
      new URL(productFiltersHref(all), "https://qaudio.test").searchParams
    ),
    all
  )
})

test("sale calendar days stay in store time across browser zones and daylight-saving changes", () => {
  const previous = process.env.TZ
  try {
    for (const zone of [
      "America/Los_Angeles",
      "America/New_York",
      "Asia/Tokyo",
      "Pacific/Kiritimati",
    ]) {
      process.env.TZ = zone
      for (const day of ["2026-03-08", "2026-11-01", "2027-01-01"])
        assert.equal(storeDay(calendarDay(day)), day)
      assert.deepEqual(
        saleDatesFromRange(
          { from: calendarDay("2026-11-01"), to: calendarDay("2026-11-03") },
          "2026-10-31T10:15",
          "2026-11-02T18:45",
          "2026-10-31"
        ),
        { start: "2026-11-01T10:15", end: "2026-11-03T18:45" }
      )
    }
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test("sale range preserves Now and leaves an incomplete end for validation", () => {
  const today = "2026-11-06"
  assert.deepEqual(
    saleDatesFromRange(
      { from: calendarDay(today), to: calendarDay(today) },
      "",
      "",
      today
    ),
    { start: "", end: "2026-11-06T23:59" }
  )
  assert.deepEqual(
    saleDatesFromRange({ from: calendarDay("2026-11-07") }, "", "", today),
    { start: "2026-11-07T00:00", end: "" }
  )
  assert.deepEqual(saleDatesFromRange(undefined, "", "", today), {
    start: "",
    end: "",
  })
})

test("source price labels do not duplicate the existing price, unit or availability", () => {
  for (const note of [
    "MSRP",
    "MSRP (Each)",
    "MSRP (Pair) · Sale Price",
    "MSRP (new) · Sale Price (Each)",
    "Used Price (pair)",
    "Item Price · Sale Price",
    "SOLD OUT",
  ])
    assert.deepEqual(
      priceQualifications(note),
      { startingAt: false, text: "" },
      note
    )
  assert.deepEqual(priceQualifications("Used Price starting at:"), {
    startingAt: true,
    text: "",
  })
  assert.deepEqual(priceQualifications("Starting at (Each)"), {
    startingAt: true,
    text: "",
  })
  assert.equal(priceQualifications("MSRP · Closeout").text, "Closeout")
  assert.equal(priceQualifications("MSRP · Demo Sale", "Demo").text, "")
  assert.equal(
    priceQualifications("Visit us for price").text,
    "Visit us for price"
  )
})

test("condition qualifications retain grades and final-sale terms without another condition label", () => {
  assert.equal(conditionQualification("Used"), "")
  assert.equal(conditionQualification("New"), "")
  assert.equal(
    conditionQualification("Used (final sale) · 6 out of 10"),
    "Final sale · 6 out of 10"
  )
  assert.equal(conditionQualification("9 out of 10"), "9 out of 10")
})

test("the score slider edits only the score in a condition note", () => {
  const imported = "Used (final sale) · 6 out of 10"
  assert.equal(conditionScore(imported), 6)
  assert.equal(conditionScore("8/10"), 8)
  assert.equal(conditionScore("10 out of 10"), 10)
  assert.equal(conditionScore("Used (final sale)"), null)
  assert.equal(conditionScore("11/10"), null)
  assert.equal(conditionNotes(imported), "Used (final sale)")

  assert.equal(
    withConditionScore(imported, 8),
    "Used (final sale) · 8 out of 10"
  )
  assert.equal(
    conditionQualification(withConditionScore(imported, 8)),
    "Final sale · 8 out of 10"
  )
  assert.equal(withConditionScore("", 0), "0 out of 10")
  assert.equal(
    withConditionScore("Used (final sale)", 7),
    "Used (final sale) · 7 out of 10"
  )
  // The saved score leaves the note as imported, so nothing reads as changed.
  assert.equal(withConditionScore("8/10", 8), "8/10")
  assert.equal(withConditionScore(imported, null), "Used (final sale)")
  assert.equal(withConditionScore("6 out of 10 · final sale", null), "final sale")
  assert.equal(withConditionScore("", null), "")

  // Notes typed beside a score come back exactly as typed.
  for (const typed of ["", "final ", "final sale · ", "Used (final sale)"]) {
    const note = withConditionNotes("6 out of 10", typed)
    assert.equal(conditionNotes(note), typed)
    assert.equal(conditionScore(note), 6)
  }
  assert.equal(withConditionNotes("", "final sale"), "final sale")
  assert.equal(withConditionNotes("6 out of 10", "Mint, 9/10"), "Mint, 9/10")
})

test("admin dropdowns list names A–Z, ignoring case and accents, numbers in order", () => {
  assert.deepEqual(
    ["Series 10", "series 2", "Zu", "Ámbar", "B&W"].toSorted(byName),
    ["Ámbar", "B&W", "series 2", "Series 10", "Zu"]
  )
})

test("editing existing price controls preserves imported qualifications without note inputs", () => {
  const baseline = valuesFrom({
    price_cents: 8900,
    price_note: "Used Price starting at:",
    condition: "Used",
    condition_note: "9 out of 10",
  })
  const input = inputFromValues(
    { ...baseline, price: "99", msrp: "129" },
    baseline
  )
  assert.equal(input.price_cents, 9900)
  assert.equal(input.msrp_cents, 12900)
  assert.equal(input.price_note, baseline.price_note)
  assert.equal(input.condition_note, baseline.condition_note)
})

test("turning off an existing sale clears it on Save while unrelated edits preserve it", () => {
  const baseline = valuesFrom({
    price_cents: 129900,
    sale: {
      price_cents: 99900,
      starts_at: null,
      ends_at: "2026-12-01T18:00",
    },
  })
  assert.equal(
    "sale" in inputFromValues({ ...baseline, name: "Updated" }, baseline),
    false
  )
  const removed = inputFromValues(
    {
      ...baseline,
      sale_price: "",
      sale_starts: "",
      sale_ends: "",
    },
    baseline
  )
  assert.equal(removed.sale, null)
  assert.equal(removed.price_cents, 129900)
})

test("the editor keeps a used equipment score and sends sold equipment as draft", () => {
  const values = valuesFrom({
    status: "published",
    condition: "Demo",
    category_slug: "used-equipment",
    condition_note: "8/10",
    msrp_cents: 129900,
  })
  const input = inputFromValues({ ...values, availability: "sold" }, values)
  assert.equal(input.status, "draft")
  assert.equal(input.condition_note, "8/10")
  assert.equal(input.msrp_cents, 129900)
  assert.equal(input.price_cents, null)
  assert.equal(inputFromValues({ ...values, price: values.msrp }, values).price_cents, 129900)
})

test("scheduled prices and their news link are saved in one RPC with store-time dates", async () => {
  const proposed = saleInputSchema.parse({
    title: "Winter sale",
    starts_at: "2027-01-11T10:00",
    ends_at: "2027-01-15T19:00",
    news_post_id: id(3),
    products: [{ id: id(1), name: "Speakers", price_cents: 10000, msrp_cents: 12000 }],
    discount: { kind: "percent", percent: 25 },
  })
  const calls = []
  await sale.saveSale({ rpc: async (...args) => {
    calls.push(args)
    return { error: null }
  } }, proposed, () => new Error("Unexpected database failure"))
  assert.deepEqual(calls, [["save_product_sales", {
    p_products: [{ id: id(1), price_cents: 10000, msrp_cents: 12000, sale_price_cents: 9000 }],
    p_starts_at: "2027-01-11T15:00:00.000Z",
    p_ends_at: "2027-01-16T00:00:00.000Z",
    p_news_post_id: id(3),
  }]])
})

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
  assert.match(
    flows.flowHint("Post the sale from our news page to Google as well", all),
    /Google Business post.*standalone/
  )
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
  const call = (name, input, state = "completed", output) => ({
    role: "assistant",
    parts: [
      { type: "tool", name, callId: `${name}-${Math.random()}`, input, state, output },
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
    steps: [
      "active",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
      "pending",
    ],
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
      steps: [
        "done",
        "done",
        "waiting",
        "pending",
        "pending",
        "pending",
        "pending",
        "pending",
      ],
    }
  )
  // A later step's card moves the stepper on even without a progress call,
  // and a skipped step stays skipped, including a feature the owner chose
  // not to show on the Sales page.
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "product-sale" }),
      progress({ flow: "product-sale", step: "prices", status: "skipped" }),
      call("news__save_news_post", {}, "completed"),
      call("deals__save_deal", { kind: "sale" }, "rejected"),
      progress({ flow: "product-sale", step: "feature", status: "skipped" }),
      call("design_story", { brief: "25% off" }, "blocked")
    ),
    {
      status: "active",
      steps: [
        "done",
        "done",
        "done",
        "skipped",
        "skipped",
        "waiting",
        "pending",
        "pending",
      ],
    }
  )
  // The featured sale's card waits like any other step's.
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "product-sale", step: "prices" }),
      call("products__save_sale", {}, "completed"),
      call("deals__save_deal", { kind: "sale" }, "approval")
    ),
    {
      status: "active",
      steps: [
        "done",
        "done",
        "done",
        "done",
        "waiting",
        "pending",
        "pending",
        "pending",
      ],
    }
  )
  // The story's design is picked; its card waits.
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "product-sale" }),
      progress({ flow: "product-sale", step: "prices", status: "skipped" }),
      call("news__save_news_post", {}, "completed"),
      call("deals__save_deal", { kind: "sale" }, "completed"),
      call("design_story", { brief: "25% off" }, "completed"),
      call("instagram__save_post", {}, "approval")
    ),
    {
      status: "active",
      steps: [
        "done",
        "done",
        "done",
        "skipped",
        "done",
        "done",
        "waiting",
        "pending",
      ],
    }
  )
  // A denied card leaves its step under way for the next proposal.
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "product-sale", step: "instagram" }),
      call("design_story", {}, "completed"),
      call("instagram__save_post", {}, "rejected"),
      owner("Make the text smaller"),
      call("edit_story", {}, "blocked")
    ),
    {
      status: "active",
      steps: [
        "done",
        "done",
        "done",
        "done",
        "done",
        "waiting",
        "pending",
        "pending",
      ],
    }
  )
  const instagramDone = [
    owner(),
    progress({ flow: "product-sale", step: "instagram" }),
    call("instagram__save_post", {}, "completed"),
  ]
  assert.equal(view(...instagramDone).status, "active")
  const google = progress({ flow: "product-sale", step: "google" })
  const design = call("googlebusiness__design_offer", {})
  assert.equal(view(...instagramDone, google, design).steps.at(-1), "active")
  const offer = (state) =>
    call("googlebusiness__save_post", { kind: "offer" }, state)
  assert.equal(view(...instagramDone, offer("completed")).status, "active")
  assert.equal(
    view(...instagramDone, google, design, offer("approval")).steps.at(-1),
    "waiting"
  )
  assert.equal(
    view(...instagramDone, google, design, offer("completed")).status,
    "done"
  )
  assert.equal(
    view(
      owner(),
      call("flow_progress", { flow: "product-sale" }, "completed", {
        steps: ["instagram: Instagram story"],
      }),
      call("instagram__save_post", {}, "completed")
    ).status,
    "done"
  )
  assert.equal(
    view(
      ...instagramDone,
      google,
      progress({ flow: "product-sale", step: "google", status: "skipped" }),
      progress({ flow: "product-sale", status: "done" })
    ).steps.at(-1),
    "skipped"
  )
  assert.deepEqual(
    view(
      owner(),
      progress({ flow: "news-instagram" }),
      call("news__save_news_post", {}, "rejected"),
      owner("Shorter title")
    ),
    { status: "active", steps: ["active", "pending"] }
  )
  // The last successful save completes the run immediately. Its metadata
  // remains available even though the stepper dismisses completed runs.
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
