import { productSaleFlow } from "../lib/product-sale-flow"
import { defineTool } from "eve/tools"
import {
  flowById,
  flowProgressSchema,
  flowsFromAttributes,
} from "../../lib/admin/flows"

// Starts a flow and moves it along (lib/admin/flows.ts). It changes nothing:
// it checks the owner has the flow on, returns what to do in the step, and
// its calls are what the chat's stepper follows.
export default defineTool({
  description:
    "Start one of the owner's flows, or move it along. Call it with { flow } to start (it returns the steps and what to do first), then { flow, step } before each next step; status skipped for a step that isn't needed, done when the last step is saved, stopped when the owner stops it. It refuses a flow the owner turned off.",
  inputSchema: flowProgressSchema,
  label: {
    start: ({ flow, step, status }) => {
      const name = flowById(flow)?.name ?? flow
      if (status === "done") return `Finished ${name}`
      if (status === "stopped") return `Stopped ${name}`
      return step ? `${name}: ${step}` : `Start ${name}`
    },
  },
  async execute({ flow: id, step, status }, ctx) {
    const flow = flowById(id)!
    const on = flowsFromAttributes(ctx.session.auth.current?.attributes)
    if ((status === "active" || status === "skipped") && !on.includes(id)) {
      throw new Error(
        `The owner turned the ${flow.name} flow off. Don't run it: do only what they asked.`
      )
    }
    if (status === "done" || status === "stopped") {
      if (id === "product-sale") {
        productSaleFlow.update(() => ({ step: null, newsPostId: null }))
      }
      return { flow: id, status }
    }
    const index = step ? flow.steps.findIndex((item) => item.id === step) : 0
    const current = flow.steps[index]
    if (id === "product-sale") {
      productSaleFlow.update((previous) => ({
        step: status === "skipped" ? null : current.id,
        newsPostId: step ? previous.newsPostId : null,
        ...(status === "active" &&
          current.id === "google" &&
          previous.googleOfferImage && {
            googleOfferImage: previous.googleOfferImage,
          }),
      }))
    }
    const next = flow.steps
      .slice(index + 1)
      .map((item) => item.id)
      .at(0)
    if (status === "skipped") {
      return {
        flow: id,
        skipped: current.id,
        next: next ?? null,
        then: next
          ? `Call flow_progress with step ${next}.`
          : "That was the last step: call flow_progress with status done.",
      }
    }
    return {
      flow: id,
      step: current.id,
      ...(!step && {
        steps: flow.steps.map((item) => `${item.id}: ${item.label}`),
      }),
      do: current.instructions,
      then: next
        ? `Once this step is done (its card saved, or the owner answered), call flow_progress with step ${next} without waiting to be asked.`
        : "Once this step's card is saved, call flow_progress with status done and say in a sentence what the flow did.",
    }
  },
})
