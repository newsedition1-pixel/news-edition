import { ImageResponse } from 'next/og'

// Sitewide fallback OG image. Article pages override this with their
// cover image via generateMetadata openGraph.images.
export const alt = 'NewsEdition — Breaking News, Latest Updates'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <div
            style={{
              width: 110,
              height: 110,
              background: '#dc2626',
              borderRadius: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: 64,
              fontWeight: 900,
              fontFamily: 'Georgia, serif',
            }}
          >
            N
          </div>
          <div
            style={{
              color: '#f8fafc',
              fontSize: 76,
              fontWeight: 800,
              fontFamily: 'Georgia, serif',
              letterSpacing: '-2px',
            }}
          >
            NewsEdition
          </div>
        </div>
        <div style={{ color: '#94a3b8', fontSize: 30 }}>
          Breaking News, Latest Updates
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ width: 220, height: 6, background: '#dc2626', borderRadius: 3 }} />
          <div style={{ width: 60, height: 6, background: '#475569', borderRadius: 3 }} />
        </div>
      </div>
    ),
    { ...size },
  )
}
