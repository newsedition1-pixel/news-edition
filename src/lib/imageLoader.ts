'use client'

// Custom next/image loader.
//
// Cloudinary already stores and serves optimized images, so routing them
// through Vercel's image optimizer (/_next/image) just burns the metered
// "Image Optimization - Transformations" quota for zero benefit. This loader
// rewrites Cloudinary URLs to do format/quality/width optimization on
// Cloudinary's own CDN instead, and passes any non-Cloudinary URL through
// untouched (Google/GitHub avatars are already small + optimized).
//
// Configured via `images.loader: 'custom'` + `images.loaderFile` in next.config.ts.

interface LoaderArgs {
  src: string
  width: number
  quality?: number
}

export default function cloudinaryLoader({ src, width, quality }: LoaderArgs): string {
  // Only transform Cloudinary delivery URLs.
  const marker = '/image/upload/'
  const idx = src.indexOf(marker)
  if (!src.includes('res.cloudinary.com') || idx === -1) {
    return src
  }

  const params = [
    'f_auto', // best format the browser supports (AVIF/WebP)
    `q_${quality ?? 'auto'}`, // auto quality unless an explicit quality is set
    `w_${width}`, // responsive width from next/image's srcset
    'c_limit', // never upscale beyond the original
  ].join(',')

  const head = src.slice(0, idx + marker.length)
  const tail = src.slice(idx + marker.length)
  return `${head}${params}/${tail}`
}
