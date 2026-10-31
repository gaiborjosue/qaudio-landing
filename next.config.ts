import type { NextConfig } from "next"

// News images are served from the Supabase media bucket.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!supabaseUrl) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL (see .env.example).")
}

const nextConfig: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: [
      new URL("/storage/v1/object/public/media/**", supabaseUrl),
    ],
  },
}

export default nextConfig
