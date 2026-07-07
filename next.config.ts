import type { NextConfig } from 'next'
import path from 'path'
import fs from 'fs'

const stylesDir = path.join(__dirname, 'src/styles')
const variables = fs.readFileSync(path.join(stylesDir, '_variables.scss'), 'utf8')
const mixins = fs.readFileSync(path.join(stylesDir, '_mixins.scss'), 'utf8')

const nextConfig: NextConfig = {
  sassOptions: {
    additionalData: `${variables}\n${mixins}\n`,
  },
  images: {
    // Bypass Vercel's image optimizer — Cloudinary handles optimization on its
    // own CDN (see src/lib/imageLoader.ts). This keeps Vercel's metered
    // "Image Optimization - Transformations" usage at zero.
    loader: 'custom',
    loaderFile: './src/lib/imageLoader.ts',
    remotePatterns: [
      { hostname: 'res.cloudinary.com' },
      { hostname: 'lh3.googleusercontent.com' },
      { hostname: 'avatars.githubusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

export default nextConfig
