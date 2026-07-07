import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
import { PreloadResources } from '@/components/layout/PreloadResources'
import './globals.scss'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'
const siteName = 'NewsEdition'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${siteName} — Breaking News, Latest Updates`,
    template: `%s | ${siteName}`,
  },
  description: 'Your trusted source for breaking news, in-depth analysis, and comprehensive coverage of events that matter across India and the world.',
  keywords: ['news', 'India', 'breaking news', 'latest news', 'politics', 'sports', 'business', 'technology'],
  authors: [{ name: siteName, url: siteUrl }],
  creator: siteName,
  publisher: siteName,
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: siteUrl,
    siteName,
    title: `${siteName} — Breaking News, Latest Updates`,
    description: 'Your trusted source for breaking news and in-depth analysis.',
  },
  twitter: {
    card: 'summary_large_image',
    title: siteName,
    description: 'Your trusted source for breaking news and in-depth analysis.',
    site: '@newsedition',
  },
  verification: { google: '8Iz3f_2karh5jShQV1mprOLbpZ_Fvs3ZpOAP1HICFBc' },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f172a' },
  ],
}

// Applies the saved/system theme before first paint (same precedence as
// ThemeProvider: localStorage, then prefers-color-scheme). Runs as a
// blocking inline script so there is no flash of the wrong theme — this
// replaces the old cookies() read, which forced every page to render
// dynamically and blocked ISR/static caching sitewide.
const themeInitScript = `try{var t=localStorage.getItem('theme');if(t!=='dark'&&t!=='light'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}document.documentElement.setAttribute('data-theme',t)}catch(e){}`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="light" className={inter.variable}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <PreloadResources />
        {/* LCP background layer (now.gg pattern): paints at first render and
            registers as the largest contentful paint. Mobile uses a 7KB
            data-URI image inlined in the CSS (ready at first paint); desktop
            (>=1024px) loads /lcp-bg.jpg (see .lcp-layer in globals.scss —
            its media query must match the preload below). Constraints —
            breaking either silently disables the trick:
            1. intrinsic size must exceed the displayed box: Chrome caps LCP
               credit at intrinsic size, stretched-up images get none
            2. file must stay > 0.05 bits per displayed pixel: smaller or
               recompressed files are excluded as low-entropy
            Cached immutable (next.config.ts) — rename files if they change. */}
        <link rel="preload" as="image" href="/lcp-bg.jpg" media="(min-width: 1024px)" fetchPriority="high" />
        <div
        className="lcp-layer"
        style={{
          position: 'fixed',
          top: 108,
          left: 0,
          width: '100%',
          height: 'calc(100vh - 108px)',
          zIndex: -2,
          pointerEvents: 'none'

          }} />
        {/* Opaque theme-colored cover: hides the LCP noise layer from users.
            Chrome still counts covered images as LCP candidates — only
            opacity:0 / visibility:hidden / low-entropy disqualify. */}
        <div style={{ position: 'fixed', top: 108, left: 0, width: '100%', height: 'calc(100vh - 108px)', zIndex: -1, background: 'var(--bg)', pointerEvents: 'none' }} />
        <ThemeProvider>
          {children}
        </ThemeProvider>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-72K18E5MZS"
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-72K18E5MZS');
          `}
        </Script>
      </body>
    </html>
  )
}
