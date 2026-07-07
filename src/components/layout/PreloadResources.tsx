'use client'
import { preconnect } from 'react-dom'

// React's resource-hint APIs are no-ops in Server Components — this tiny
// client component emits them into <head> during SSR (pattern from the
// Next.js "preloading resources" docs).
// The LCP image preloads live in the root layout as <link> tags because
// ReactDOM.preload does not support the media attribute needed for the
// mobile/desktop variant split.
export function PreloadResources() {
  // Hero/cover images load from Cloudinary — warm up the connection early
  preconnect('https://res.cloudinary.com')
  return null
}
