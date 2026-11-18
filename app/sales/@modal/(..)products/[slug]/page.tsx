import {
  InterceptedProduct,
  interceptedProductMetadata,
} from "@/components/intercepted-product"

// Intercepts /products/<slug> when it's opened from the Sales page's list,
// so the list stays mounted instead of navigating to the full product page.
export const generateMetadata = interceptedProductMetadata
export default InterceptedProduct
