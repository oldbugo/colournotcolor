/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true, // Keep disabled - no .eslintrc yet
  },
  typescript: {
    ignoreBuildErrors: false, // Enable - code is already type-safe
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig