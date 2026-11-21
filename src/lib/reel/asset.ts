/**
 * What the automatic Reel needs from an article: the cover credit as plain text and a small cover
 * picture. Pure and unit-tested; the route `GET /api/reel-asset/{slug}` does the network part.
 */
import { cloudinaryVariant, hasAiCover, plain } from '../social/compose'

/** 1080x640 crop around the subject, JPEG, small enough to travel as base64 in a JSON answer. */
export const REEL_PHOTO = 'c_fill,g_auto,w_1080,h_640,f_jpg,q_70'

export type ReelCoverKind = 'photo' | 'ai' | 'none'

export interface ReelCover {
  kind: ReelCoverKind
  /** "Cover image: courtesy The Indian Express." as plain text, or null when the article carries none. */
  credit: string | null
}

const CREDIT = /<p>\s*<em>\s*(Cover image:[\s\S]*?)<\/em>\s*<\/p>/i

/**
 * Reads the cover credit line from the stored article HTML.
 * - `ai`: the cover is the labelled AI illustration (the Reel is made without a picture, like Instagram posts).
 * - `photo`: a credited photo (Wikimedia Commons or a publisher's own news photo).
 * - `none`: no credit line at all, so no picture can be shown with its credit; the Reel goes without one.
 */
export function coverOf(content: string | null | undefined): ReelCover {
  const html = content ?? ''
  const m = html.match(CREDIT)
  const credit = m ? plain(m[1]).replace(/\s+([.,;:])/g, '$1') : null
  if (hasAiCover(html)) return { kind: 'ai', credit }
  if (!credit) return { kind: 'none', credit: null }
  return { kind: 'photo', credit }
}

/** The small cover picture's URL (a Cloudinary variant), or null when the cover is not a Cloudinary upload. */
export function reelPhotoUrl(coverImage: string | null): string | null {
  const url = cloudinaryVariant(coverImage, REEL_PHOTO)
  return url && url !== coverImage ? url : null
}

/** Slugs in this site are lower-case words and digits joined by hyphens. */
export function isSlug(s: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 600
}
