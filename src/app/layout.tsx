import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { cookies } from 'next/headers'
import Script from 'next/script'
import { ThemeProvider } from '@/components/layout/ThemeProvider'
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const theme = cookieStore.get('theme')?.value === 'dark' ? 'dark' : 'light'

  return (
    <html lang="en" suppressHydrationWarning data-theme={theme} className={inter.variable}>
      <body>
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
