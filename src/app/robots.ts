import type { MetadataRoute } from 'next'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://newsedition.in'

// Private / non-content paths, blocked for every crawler that is allowed in.
const PRIVATE_PATHS = ['/admin/', '/api/', '/login', '/register', '/verify-email', '/settings/']

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        // Search engines: full access to public content.
        userAgent: [
          'Googlebot', 'Googlebot-News', 'Googlebot-Image', 'Bingbot', 'Slurp',
          'DuckDuckBot', 'Baiduspider', 'YandexBot',
        ],
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      {
        // AI search / answer engines and user-triggered fetchers: these are how
        // NewsEdition gets cited and linked in ChatGPT, Claude and Perplexity answers.
        userAgent: [
          'OAI-SearchBot', 'ChatGPT-User',
          'Claude-SearchBot', 'Claude-User',
          'PerplexityBot', 'Perplexity-User',
        ],
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
      {
        // AI model-training crawlers stay blocked (blocking these does not
        // affect search or answer-engine visibility above).
        userAgent: ['GPTBot', 'CCBot', 'anthropic-ai', 'Claude-Web', 'Omgilibot', 'FacebookBot'],
        disallow: '/',
      },
      {
        // Everyone else.
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PATHS,
      },
    ],
    sitemap: [`${siteUrl}/sitemap.xml`, `${siteUrl}/news-sitemap.xml`],
  }
}
