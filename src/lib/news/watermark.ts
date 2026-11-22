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

/** The NewsEdition logo, bottom-right corner, 22% of the image width. Always the last step, after the resize. */
function logoOverlayStep(): Record<string, unknown> {
  return { overlay: WATERMARK_OVERLAY_ID, gravity: 'south_east', width: 0.22, flags: 'relative', x: 0.02, y: 0.03 }
}

/**
 * Incoming transformation for the final cover: the picture is brought to the standard cover size first
 * (see `coverResizeStep`), then the logo is burned into the corner of the finished cover, so a crop can
 * never cut the logo off.
 */
export function coverTransformation(resize: Record<string, unknown>, withLogo: boolean): Record<string, unknown>[] {
  return withLogo ? [resize, logoOverlayStep()] : [resize]
}
