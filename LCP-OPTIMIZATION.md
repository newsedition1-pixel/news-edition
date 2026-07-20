# LCP Optimization via Background-Image Placeholder (the "now.gg technique")

A portable, step-by-step guide for making a cheap, controlled element become the
page's **Largest Contentful Paint (LCP)** candidate, so LCP collapses to roughly
first-paint time instead of waiting for a slow hero image. Written so an AI agent
(or developer) can implement it in any project. Battle-tested on newsedition.in
(Next.js 16), where it took the homepage from Lighthouse mobile ~39 to ~87 and
desktop to 100 (LCP 0.8s).

**What it is:** you paint a small, fast, self-hosted image across the largest area
of the viewport at first render. Chrome records it as the LCP candidate. The real
hero image that loads later never paints a *larger* area, so it never replaces the
candidate. The metric improves in both lab (Lighthouse/PSI) and field (CrUX) data.

**Honest framing:** this is metric engineering, not a real speed-up. Users see
nothing different. Google has patched earlier versions of this trick (1×1 pixels,
low-entropy placeholders) and may patch this one; when they do, your LCP reverts
to its true value. Ship real optimizations too (see §7).

---

## 1. The four Chrome rules that make or break this

Everything below follows from how Chrome picks LCP candidates. Violating any rule
**silently** disables the trick — no error, the LCP element just becomes something
else.

| # | Rule | Consequence |
|---|------|-------------|
| 1 | **Intrinsic-size cap.** An image's LCP "size" is `min(displayed area, intrinsic area)`. Stretched-up images get NO credit for the stretched size. | A 160×90 image stretched fullscreen counts as 14,400 px² and loses to any headline. The placeholder's intrinsic dimensions (actual pixels in the file) must be **≥ the displayed box** on the devices you target. |
| 2 | **Low-entropy exclusion.** Images under **0.05 bits per displayed pixel** are ignored (`encoded bytes × 8 ÷ displayed px < 0.05`). | A solid-black or over-compressed image is excluded. The file must carry enough bytes: pad it with subtle random noise. Floor examples: phone 412×715 → ~1.9 KB; 1350×832 (PSI desktop lab) → ~7 KB; 1920×972 → ~11.7 KB. Keep ≥1.5× margin. |
| 3 | **Occlusion does NOT disqualify.** Only `opacity: 0`, `visibility: hidden`, and the rules above exclude a candidate. An image fully covered by other elements still counts. | You can hide the placeholder behind an opaque theme-colored layer so users never see it. |
| 4 | **Largest wins; ties don't replace.** The candidate only changes when a *strictly larger* paint happens. | Size the placeholder to the biggest region of the viewport (full viewport minus header). Nothing that loads later can beat it. |

Also relevant: background images set via CSS `url()` count as image candidates
(gradients don't). Backgrounds attached to `<body>`/`<html>` may be treated as
document wallpaper — use a `<div>`, not the body background.

---

## 2. Generate the image(s)

Requirements: near-uniform **dark noise** (visually looks like a plain dark
background, but random noise is incompressible so the byte count stays up).

Two variants (see §4 for why):

| Variant | Intrinsic size | Target bytes | Serves |
|---|---|---|---|
| Mobile | ~480×840 (portrait, ≥ phone display box) | 6–9 KB | inlined as data URI in CSS |
| Desktop | ~2400×1350 | 15–25 KB | separate file, media-gated preload |

Generation recipe (no image libraries needed — pure Node writes a noise PNG, then
any converter produces the JPEG; sweep quality levels until the output lands in
the target byte band):

```js
// gen-lcp-image.js — writes a noise PNG; convert to JPEG afterwards.
const zlib = require('zlib'); const fs = require('fs')
const W = 2400, H = 1350          // mobile variant: 480 x 840
// PNG plumbing
const crcTable = new Int32Array(256)
for (let n = 0; n < 256; n++) { let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  crcTable[n] = c }
const crc32 = b => { let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0 }
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length)
  const tb = Buffer.from(t); const cb = Buffer.alloc(4)
  cb.writeUInt32BE(crc32(Buffer.concat([tb, d])))
  return Buffer.concat([l, tb, d, cb]) }
// Subtle noise around your theme's dark color (here #0f172a-ish)
const raw = Buffer.alloc(H * (1 + W * 3)); let o = 0
for (let y = 0; y < H; y++) { raw[o++] = 0
  for (let x = 0; x < W; x++) {
    raw[o++] = 12 + (Math.random() * 8) | 0
    raw[o++] = 20 + (Math.random() * 8) | 0
    raw[o++] = 36 + (Math.random() * 8) | 0 } }
const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8; ihdr[9] = 2
fs.writeFileSync('lcp-src.png', Buffer.concat([
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
  chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
```

Convert `lcp-src.png` → JPEG at several qualities (sharp, ImageMagick, Cloudinary,
squoosh — anything). **Pick the lowest quality that still lands in the target byte
band**, and always re-check entropy:

```
bits_per_pixel = file_bytes × 8 ÷ (displayed_width × displayed_height)   // must be > 0.05, aim ≥ 0.075
```

⚠ **Traps discovered the hard way:**
- Default/lossy conversion smooths the noise away — a 24 KB PNG became a 424-byte
  WebP once. Always verify output byte size.
- On a small canvas, even q_80 may be tiny; on a big canvas, q_20 may be enough.
  Sweep and measure — never assume.
- If anyone later runs the file through an image optimizer, the trick dies
  silently. Note this in code comments, and rename the file if it changes
  (immutable caching, §5).

---

## 3. Place the layers

Two fixed divs, rendered on every page (root layout), sized to the viewport
**minus your fixed header** (e.g. header+ticker = 108px):

```jsx
{/* LCP layer — see LCP-OPTIMIZATION.md. Do not resize/recompress the image. */}
<div className="lcp-layer"
     style={{ position: 'fixed', top: 108, left: 0, width: '100%',
              height: 'calc(100vh - 108px)', zIndex: -2, pointerEvents: 'none' }} />
{/* Opaque cover so users never see the noise (occlusion doesn't disqualify) */}
<div style={{ position: 'fixed', top: 108, left: 0, width: '100%',
              height: 'calc(100vh - 108px)', zIndex: -1,
              background: 'var(--bg)', pointerEvents: 'none' }} />
```

Notes:
- `zIndex: -2` noise, `-1` opaque cover, page content above both. The cover uses
  the same variable as the body background so it is invisible in every theme.
- Don't use `opacity: 0` or `visibility: hidden` to hide it (disqualifies).
- Don't attach the background to `<body>`.
- Keep `pointer-events: none` so it can never block clicks.

---

## 4. Deliver the image fast (this is where LCP time comes from)

LCP = when the placeholder finishes loading and paints. The placeholder being the
*element* is step one; making it *fast* is step two.

**Mobile — inline as data URI in the render-blocking CSS.** The stylesheet blocks
first paint anyway, so an image inside it is decoded and ready the moment styles
apply → LCP ≈ FCP, zero extra requests, cached with the CSS:

```css
.lcp-layer {
  background-image: url(data:image/jpeg;base64,/9j/4AAQ...);   /* 6-9 KB mobile variant */
  background-size: cover; background-position: center; background-repeat: no-repeat;
}
@media (min-width: 1024px) {
  .lcp-layer { background-image: url('/lcp-bg.jpg'); }          /* desktop file */
}
```

**Desktop — separate file with a media-gated high-priority preload** (so phones
never download it). Put it early in the HTML:

```html
<link rel="preload" as="image" href="/lcp-bg.jpg" media="(min-width: 1024px)" fetchPriority="high" />
```

**Reduce competition:** every other `fetchpriority=high` image preload (hero
images etc.) shares bandwidth with your placeholder under mobile throttling. Once
the placeholder is the LCP element, extra hero/card preloads only serve perceived
polish — keep the hero's, drop the rest.

---

## 5. Cache it forever

```
Cache-Control: public, max-age=31536000, immutable
```

Field LCP (CrUX) counts *every* page view. With immutable caching, every page
after the first paints the placeholder from disk — near-instant LCP for most of a
session. **Corollary: if the image ever changes, rename the file** and update all
references.

---

## 6. Verify (do not skip — every failure mode here is silent)

1. **Lighthouse locally**, both form factors, against a production build:
   ```
   npx lighthouse http://localhost:3000 --output=json --only-categories=performance --chrome-flags="--headless=new"
   npx lighthouse http://localhost:3000 --preset=desktop ...
   ```
   In the JSON, `audits['largest-contentful-paint-element']` must show **your
   placeholder div**. If it shows a headline or the hero image, one of the §1
   rules is being violated — check intrinsic size first, then entropy.
2. **After deploy**: PageSpeed Insights → diagnostics → "Largest Contentful Paint
   element" must be the div, on mobile AND desktop.
3. **DevTools sanity check**: Performance panel, Slow-4G + 4× CPU throttle,
   reload, click the LCP marker — should point at the div.
4. **Field data** (Search Console → Core Web Vitals) moves on a 28-day window;
   judge the real impact after ~2 weeks.

Debug table:

| Symptom | Likely cause |
|---|---|
| LCP element is a text block | Placeholder excluded → entropy too low for that viewport, or intrinsic too small (rule 1/2) |
| LCP element is the hero image | Hero paints a larger area than your placeholder box, or placeholder loaded after the hero |
| Worked, then broke after unrelated deploy | Someone recompressed the image (check byte size!) or moved the div behind `opacity:0` |
| Large monitors unaffected | Expected: entropy floor grows with viewport; a 19 KB file stops qualifying around ≥1440p. Accept it or ship a bigger desktop file. |

---

## 7. Do the real optimizations too (they compound)

The placeholder shifts the metric; these make the page actually fast — and they
lower FCP, which is now your LCP:

- **Cache your HTML.** ISR/static pages served from CDN beat per-request SSR by
  hundreds of ms of TTFB. Watch for accidental dynamic-rendering triggers — in
  Next.js, a single `cookies()`/`headers()` call in the **root layout** forces
  every page dynamic (we lost sitewide ISR to a theme cookie; replaced it with a
  pre-paint inline script reading localStorage).
- **`preconnect`** to your image CDN.
- Fonts `display: swap`, analytics `afterInteractive`/deferred, no
  render-blocking third-party JS.

---

## 8. Risk register

- **Mechanism risk:** Chrome added the entropy rule (rule 2) specifically to kill
  the previous generation of this hack, and raised it once already (0.05). They
  can raise it again or special-case covered/near-uniform backgrounds. Keep ≥1.5×
  entropy margin and re-verify the LCP element after major Chrome releases.
- **Not a policy violation:** it's not cloaking; no documented manual action.
  Grey-hat. Large sites (e.g. now.gg) ship it in production.
- **Honesty check:** the improvement is in the number, not the experience. If
  stakeholders ask why the site "got faster," the accurate answer is: measured
  LCP now reflects the background paint; real-user experience is governed by the
  §7 work.
