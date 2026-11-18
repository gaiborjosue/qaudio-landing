import {
  InterceptedProduct,
  interceptedProductMetadata,
} from "@/components/intercepted-product"

// Intercepts /products/<slug> when it's opened from a shop list, so the list
// stays mounted instead of navigating to the full product page.
export const generateMetadata = interceptedProductMetadata
export default InterceptedProduct
