import test from 'node:test'
import assert from 'node:assert/strict'
import { checkDraft, cleanLine, composeXPost, isPollSafe, parseDraft, writeDraft, X_IMAGE, type XDraft } from './xcopy'
import { weightedLength, type ArticleForSocial } from './compose'

const article: ArticleForSocial = {
  title: 'RBI keeps repo rate unchanged at 5.5% for the third time',
  excerpt: 'The Reserve Bank of India left the repo rate at 5.5% on Friday and kept its stance neutral.',
  url: 'https://newsedition.in/article/rbi-repo-rate',
  tags: ['RBI', 'Repo rate', 'Monetary policy'],
  categorySlug: 'business',
  categoryName: 'Business',
  imageUrl: 'https://res.cloudinary.com/demo/image/upload/v1/cover.jpg',
  content: '<p>The Reserve Bank of India left the repo rate at 5.5% on Friday. Governor Sanjay Malhotra said inflation stayed below 4% and growth held up. Home loan borrowers will see no change in their EMI.</p>',
}

const good: XDraft = {
  hook: 'RBI holds the repo rate at 5.5% for a third time',
  fact: 'Inflation is below 4%, so home loan EMIs stay where they are.',
  poll: null,
}

test('model text is reduced to one plain line', () => {
  assert.equal(cleanLine('Rates hold 🚨 see https://x.com/a #RBI @someone now'), 'Rates hold see now')
  assert.equal(cleanLine(null), '')
})

test('a draft is read from the model JSON, and a missing hook is refused', () => {
  const d = parseDraft({ hook: 'A hook', fact: 'A fact.', poll: { question: 'Right call?', options: ['Yes', ' No ', ''] } })
  assert.deepEqual(d, { hook: 'A hook', fact: 'A fact.', poll: { question: 'Right call?', options: ['Yes', 'No'] } })
  assert.equal(parseDraft({ fact: 'only a fact' }), null)
  assert.equal(parseDraft('text'), null)
})

test('a draft that stays inside the article passes', () => {
  assert.deepEqual(checkDraft(good, article, false), [])
})

test('invented figures and names are caught', () => {
  const figure = checkDraft({ ...good, fact: 'Inflation is below 7%, so loans get cheaper for everyone.' }, article, false)
  assert.match(figure.join(' '), /figures.*7/)
  const name = checkDraft({ ...good, fact: 'Governor Rajan said inflation stayed below 4%, so loans stay put.' }, article, false)
  assert.match(name.join(' '), /Rajan/)
})

test('clickbait, shouting, wrong length and a repeated hook are caught', () => {
  assert.match(checkDraft({ ...good, hook: 'You won\'t believe what the RBI did to the repo rate' }, article, false).join(' '), /clickbait/)
  assert.match(checkDraft({ ...good, hook: 'RBI HOLDS THE REPO RATE at 5.5%!' }, article, false).join(' '), /exclamation|capital/)
  assert.match(checkDraft({ ...good, hook: 'RBI holds' }, article, false).join(' '), /hook must be/)
  assert.match(checkDraft({ ...good, fact: 'RBI holds the repo rate at 5.5% for a third time again.' }, article, false).join(' '), /repeats/)
})

test('a poll must be balanced, short, and about the story', () => {
  const poll = { question: 'Is holding the rate the right call?', options: ['Right call', 'Wrong call', 'Not sure'] }
  assert.deepEqual(checkDraft({ ...good, poll }, article, true), [])
  assert.match(checkDraft(good, article, true).join(' '), /missing/)
  assert.match(checkDraft({ ...good, poll: { ...poll, options: ['Yes'] } }, article, true).join(' '), /2 or 3/)
  assert.match(checkDraft({ ...good, poll: { ...poll, options: ['A very long option that cannot fit', 'No'] } }, article, true).join(' '), /25/)
  assert.match(checkDraft({ ...good, poll: { ...poll, question: 'Is a 9% rate right' } }, article, true).join(' '), /question|figures/)
})

test('only neutral stories from the open desks get a poll', () => {
  const base = { title: 'Sensex ends higher as banks rally', excerpt: null, categorySlug: 'business' }
  assert.equal(isPollSafe(base), true)
  assert.equal(isPollSafe({ ...base, categorySlug: 'politics' }), false)
  assert.equal(isPollSafe({ ...base, categorySlug: null }), false)
  assert.equal(isPollSafe({ ...base, title: 'Fire at factory kills three' }), false)
  assert.equal(isPollSafe({ ...base, excerpt: 'BJP leaders welcomed the move' }), false)
})

test('a post is hook, fact, link and tags, inside the X limit', () => {
  const p = composeXPost({ article, draft: good, plan: { format: 'post', link: true, image: true } })
  assert.equal(p.copy, 'ai')
  assert.ok(p.text.startsWith(good.hook))
  assert.ok(p.text.includes(good.fact))
  assert.ok(p.text.includes(article.url))
  assert.ok(weightedLength(p.text) - (article.url.length - 23) <= 280)
  assert.equal(p.imageUrl, `https://res.cloudinary.com/demo/image/upload/${X_IMAGE}/v1/cover.jpg`)
  assert.equal(p.poll, null)
})

test('without a link the tweet carries none, and without an image it has no picture', () => {
  const p = composeXPost({ article, draft: good, plan: { format: 'post', link: false, image: false } })
  assert.ok(!p.text.includes('http'))
  assert.equal(p.imageUrl, null)
})

test('a long fact makes room for the link before it is cut', () => {
  const long: XDraft = { hook: good.hook, fact: 'x'.repeat(180), poll: null }
  const p = composeXPost({ article, draft: long, plan: { format: 'post', link: true, image: false } })
  assert.ok(p.text.includes(article.url))
  assert.ok(weightedLength(p.text) - (article.url.length - 23) <= 280)
})

test('without a checked draft the plain headline tweet goes out', () => {
  const p = composeXPost({ article, draft: null, plan: { format: 'post', link: false, image: true } })
  assert.equal(p.copy, 'plain')
  assert.ok(p.text.startsWith('RBI keeps repo rate unchanged'))
  assert.ok(p.imageUrl?.includes(X_IMAGE))
})

test('a poll tweet has the question and the options, and no picture, link or tags', () => {
  const draft: XDraft = { ...good, poll: { question: 'Is holding the rate the right call?', options: ['Right call', 'Wrong call', 'Not sure'] } }
  const p = composeXPost({ article, draft, plan: { format: 'poll', link: false, image: false } })
  assert.equal(p.text, `${good.hook}\n\nIs holding the rate the right call?`)
  assert.deepEqual(p.poll?.options, ['Right call', 'Wrong call', 'Not sure'])
  assert.equal(p.poll?.durationMinutes, 1440)
  assert.equal(p.imageUrl, null)
  const plain = composeXPost({ article, draft: null, plan: { format: 'poll', link: false, image: false } })
  assert.equal(plain.copy, 'plain')
  assert.equal(plain.poll?.options.length, 3)
})

test('the writer asks again with the reasons, and gives up quietly', async () => {
  const answers = [
    JSON.stringify({ hook: good.hook, fact: 'Inflation is below 9%, so home loan EMIs stay where they are.' }),
    JSON.stringify({ hook: good.hook, fact: good.fact }),
  ]
  const seen: number[] = []
  const r = await writeDraft(async (m) => { seen.push(m.length); return answers.shift() ?? null }, article, false)
  assert.deepEqual(r.draft && { hook: r.draft.hook, fact: r.draft.fact }, { hook: good.hook, fact: good.fact })
  assert.deepEqual(seen, [2, 4])

  const bad = await writeDraft(async () => JSON.stringify({ hook: 'RBI holds' }), article, false)
  assert.equal(bad.draft, null)
  assert.ok(bad.issues.length > 0)
  const none = await writeDraft(async () => null, article, false)
  assert.equal(none.draft, null)
})
