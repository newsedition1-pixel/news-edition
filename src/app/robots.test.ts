import test from 'node:test'
import assert from 'node:assert/strict'
import robots from './robots'

// The bots that fetch pages to answer people (search, citation, on-demand reading). If one of these
// is ever blocked by a robots.ts edit, NewsEdition silently disappears from that assistant's answers.
const ANSWER_BOTS = [
  'Googlebot', 'Bingbot',                      // Google AI Overviews / AI Mode, Microsoft Copilot
  'Google-Extended',                           // Gemini apps
  'OAI-SearchBot', 'ChatGPT-User', 'GPTBot',   // ChatGPT
  'Claude-SearchBot', 'Claude-User',           // Claude
  'PerplexityBot', 'Perplexity-User',          // Perplexity
]

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] }
const asList = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v])

function ruleFor(bot: string): Rule {
  const rules = robots().rules as Rule[]
  return (
    rules.find((r) => asList(r.userAgent).some((u) => u.toLowerCase() === bot.toLowerCase())) ??
    rules.find((r) => asList(r.userAgent).includes('*'))!
  )
}

for (const bot of ANSWER_BOTS) {
  test(`${bot} may read articles, categories and the feed`, () => {
    const rule = ruleFor(bot)
    assert.ok(asList(rule.allow).includes('/'), 'allow /')
    const blocked = asList(rule.disallow)
    assert.equal(blocked.includes('/'), false, 'whole site not blocked')
    for (const path of ['/article/some-story', '/sports', '/technology', '/feed.xml', '/llms.txt', '/news-sitemap.xml']) {
      assert.equal(blocked.some((d) => path.startsWith(d)), false, `${path} not blocked`)
    }
  })
}

test('private areas stay blocked for the answer bots', () => {
  for (const bot of ANSWER_BOTS) {
    const blocked = asList(ruleFor(bot).disallow)
    for (const p of ['/admin/', '/api/', '/login']) assert.ok(blocked.includes(p), `${bot} ${p}`)
  }
})

test('both sitemaps are declared', () => {
  const sm = asList(robots().sitemap as string | string[])
  assert.ok(sm.some((s) => s.endsWith('/sitemap.xml')))
  assert.ok(sm.some((s) => s.endsWith('/news-sitemap.xml')))
})
