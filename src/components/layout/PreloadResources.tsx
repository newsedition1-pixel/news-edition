'use client'
import { preconnect, preload } from 'react-dom'

// React's resource-hint APIs are no-ops in Server Components — this tiny
// client component emits them into <head> during SSR (pattern from the
// Next.js "preloading resources" docs).
export function PreloadResources() {
  // Hero/cover images load from Cloudinary — warm up the connection early
  preconnect('https://res.cloudinary.com')
  // LCP background layer — must arrive first
  preload('/lcp-bg.jpg', { as: 'image', fetchPriority: 'high' })
  return null
}
