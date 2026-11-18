import { defineState } from "eve/context"

export const productSaleFlow = defineState<{
  step: string | null
  newsPostId: string | null
}>("qaudio.product-sale-flow", () => ({ step: null, newsPostId: null }))
