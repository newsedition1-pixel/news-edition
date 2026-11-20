import 'server-only'
import cloudinary from '@/lib/cloudinary'
import { WATERMARK_PNG_DATA_URI } from './watermarkData'

/** Where the logo lives in Cloudinary. Folder separators become ":" when used as an overlay id. */
const WATERMARK_PUBLIC_ID = 'newsedition/brand/watermark'
const WATERMARK_OVERLAY_ID = WATERMARK_PUBLIC_ID.replace(/\//g, ':')

let ready: Promise<void> | null = null

/** Uploads the NewsEdition logo to Cloudinary once (never overwrites an existing one). */
export function ensureWatermark(): Promise<void> {
  if (!ready) {
    ready = cloudinary.uploader
      .upload(WATERMARK_PNG_DATA_URI, { public_id: WATERMARK_PUBLIC_ID, overwrite: false, resource_type: 'image' })
      .then(() => undefined)
      .catch((err) => {
        ready = null // try again on the next image
        throw err
      })
  }
  return ready
}

/**
 * Incoming transformation applied while uploading a cover image: cap the width at 1600px and burn the
 * NewsEdition logo into the bottom-right corner at 22% of the image width.
 */
export function watermarkTransformation(): Record<string, unknown>[] {
  return [
    { width: 1600, crop: 'limit' },
    { overlay: WATERMARK_OVERLAY_ID, gravity: 'south_east', width: 0.22, flags: 'relative', x: 0.02, y: 0.03 },
  ]
}
