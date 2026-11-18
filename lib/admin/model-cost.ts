/** Provider-reported USD cost, never a price inferred from token counts. */
export type ModelCost = { model: string; costUsd: number | null }

export const PLAN_MODEL_ID = "openai/gpt-6.2-sol"
export const MAIN_MODEL_ID = PLAN_MODEL_ID
export const FAST_MODEL_ID = "meta/muse-ember"

export const validCost = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
