import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Main crawlers — full access to public content
        userAgent: ['Googlebot', 'Googlebot-News', 'Bingbot', 'Slurp', 'DuckDuckBot', 'Baiduspider', 'YandexBot'],
        allow: '/',
        disallow: ['/admin/', '/api/', '/login', '/register', '/verify-email', '/settings/'],
      },
      {
        // Image crawlers — allow everything public
        userAgent: ['Googlebot-Image', 'Bingbot'],
        allow: ['/article/', '/author/'],
      },
      {
        // Block AI training crawlers
        userAgent: ['GPTBot', 'ChatGPT-User', 'CCBot', 'anthropic-ai', 'Claude-Web', 'Omgilibot', 'FacebookBot'],
        disallow: '/',
      },
      {
        // Default for all others
        userAgent: '*',
        allow: '/',
        disallow: ['/admin/', '/api/', '/login', '/register', '/verify-email', '/settings/'],
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`, `${siteUrl}/news-sitemap.xml`],
    host: siteUrl,
  }
}
