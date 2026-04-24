/** @type {import('next').NextConfig} */
const nextConfig = {
  production: {
    sourcemap: false,
  },
  favicon: "/favicon.svg",
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '*.railway.app' },
      { protocol: 'https', hostname: '*.up.railway.app' },
    ],
  },
}

module.exports = nextConfig
