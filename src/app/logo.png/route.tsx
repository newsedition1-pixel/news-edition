import { ImageResponse } from 'next/og'

// Publisher logo referenced by NewsArticle / NewsMediaOrganization JSON-LD.
// Google News guidelines: rectangular wordmark, height ≤ 60px.
export const dynamic = 'force-static'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 200,
          height: 60,
          background: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: '#dc2626',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            fontSize: 24,
            fontWeight: 900,
            fontFamily: 'Georgia, serif',
          }}
        >
          N
        </div>
        <div
          style={{
            color: '#0f172a',
            fontSize: 22,
            fontWeight: 800,
            fontFamily: 'Georgia, serif',
            letterSpacing: '-0.5px',
          }}
        >
          NewsEdition
        </div>
      </div>
    ),
    { width: 200, height: 60 },
  )
}
