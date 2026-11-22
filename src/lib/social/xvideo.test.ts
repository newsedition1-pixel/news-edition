import test from 'node:test'
import assert from 'node:assert/strict'
import { HINDI_TOTAL_WORDS, VIDEO_HEADLINE_ASK, VIDEO_HEADLINE_MAX, VIDEO_STORY_TRIES, alreadyVideoed, buildHindiPrompt, buildSpec, buildWordsPrompt, checkHindi, checkWords, dateLabel, hindiScript, hindiWordCounts, isMp4, parseHindi, parseWords, pickVideoRow, pickVideoRows, publisherOf, videoLogId, videosToday, voiceScript, writeHindi, writeWords, type VideoRow } from './xvideo'
import type { Message } from './xcopy'
import type { ShareEntry } from './log'

const NOW = new Date('2026-11-22T13:30:00Z')
const credit = '<p><em>Cover image: courtesy The Indian Express.</em></p>'
const body = '<p>The Reserve Bank of India left the repo rate at 5.5% on Friday. Home loan borrowers will see no change in their EMI.</p>'

function row(over: Partial<VideoRow> = {}): VideoRow {
  return {
    id: 7, slug: 'rbi-repo', title: 'RBI keeps repo rate unchanged at 5.5%', excerpt: 'The Reserve Bank of India left the repo rate at 5.5%.',
    content: `${body}<div class="article-sources">${credit}<p>Source: The Indian Express.</p></div>`,
    coverImage: 'https://res.cloudinary.com/demo/image/upload/v1/cover.jpg', publishedAt: new Date('2026-11-22T09:00:00Z'), categorySlug: 'business', categoryName: 'Business', ...over,
  }
}

const logEntry = (over: Partial<ShareEntry>): ShareEntry => ({ id: 1, title: 't', at: NOW.toISOString(), dry: false, top: false, reason: '', results: { x: { ok: true } }, ...over })

test('the newest fresh story with a credited photo is chosen', () => {
  const pick = pickVideoRow([row({ id: 1, content: body }), row({ id: 2 }), row({ id: 3 })], [], NOW)
  assert.equal(pick?.row.id, 2)
  assert.match(pick?.photoUrl ?? '', /c_fill,g_auto,w_1080,h_640/)
  assert.equal(pick?.credit, 'Cover image: courtesy The Indian Express.')
})

test('old stories, AI covers, sensitive stories and videoed stories are passed over', () => {
  const old = row({ id: 1, publishedAt: new Date('2026-11-20T09:00:00Z') })
  const ai = row({ id: 2, content: `${body}<p><em>Cover image: AI-generated illustration.</em></p>` })
  const harm = row({ id: 3, title: 'Fire at factory kills three workers' })
  const done = row({ id: 4 })
  const none = row({ id: 5, coverImage: 'https://example.com/a.jpg' })
  const log = [logEntry({ id: videoLogId(4) })]
  assert.equal(pickVideoRow([old, ai, harm, done, none], log, NOW), null)
  assert.equal(alreadyVideoed(log, 4), true)
})

test('videos of the day are counted by the Indian calendar day', () => {
  const log = [logEntry({ id: -4 }), logEntry({ id: -9, at: '2026-11-21T10:00:00Z' }), logEntry({ id: 12 })]
  assert.equal(videosToday(log, NOW), 1)
})

test('the frame text comes with the publisher, the desk and the date', () => {
  assert.equal(publisherOf(row().content), 'The Indian Express')
  const spec = buildSpec(row(), { headline: 'h', points: ['a', 'b', 'c'] }, NOW)
  assert.deepEqual({ pillar: spec.pillar, source: spec.source, date: spec.date, handle: spec.handle }, { pillar: 'Business', source: 'The Indian Express via NewsEdition', date: '22 Nov 2026', handle: '@NewsEdition_1' })
  assert.equal(dateLabel(new Date('2026-12-31T20:00:00Z')), '1 Jan 2027')
})

const article = { title: row().title, excerpt: row().excerpt, url: 'u', tags: [], categorySlug: 'business', categoryName: 'Business', imageUrl: null, content: row().content }

test('the words must fit the frame and stay inside the article', () => {
  const good = { headline: 'RBI holds the repo rate at 5.5%', points: ['The repo rate stays at 5.5% this time', 'Home loan EMI does not change for borrowers', 'The Reserve Bank left its stance neutral'] }
  assert.deepEqual(checkWords(good, article), [])
  assert.match(checkWords({ ...good, headline: 'RBI holds the repo rate at 5.5% for the third time in a row this year' }, article).join(' '), /headline must be/)
  assert.match(checkWords({ ...good, points: good.points.slice(0, 2) }, article).join(' '), /exactly 3/)
  assert.match(checkWords({ ...good, points: ['The repo rate stays at 6.5% this time', good.points[1], good.points[2]] }, article).join(' '), /figures/)
})

test('model JSON is cleaned, and the writer retries once', async () => {
  assert.deepEqual(parseWords({ headline: 'A 🚨 headline https://x.co', points: ['one', ' two '] }), { headline: 'A headline', points: ['one', 'two'] })
  assert.equal(parseWords({ points: [] }), null)
  const answers = [
    JSON.stringify({ headline: 'RBI holds the repo rate at 7%', points: ['one fact is here and long', 'two fact is here and long', 'three fact is here and long'] }),
    JSON.stringify({ headline: 'RBI holds the repo rate at 5.5%', points: ['The repo rate stays at 5.5% this time', 'Home loan EMI does not change for borrowers', 'The Reserve Bank left its stance neutral'] }),
  ]
  const r = await writeWords(async () => answers.shift() ?? null, article)
  assert.equal(r.words?.headline, 'RBI holds the repo rate at 5.5%')
  assert.equal((await writeWords(async () => null, article)).words, null)
})

test('only an MP4 passes the upload check', () => {
  const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0])
  assert.equal(isMp4(mp4), true)
  assert.equal(isMp4(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), false)
  assert.equal(isMp4(new Uint8Array(4)), false)
})

test('several stories are offered, newest first, so a rejected text does not end the day', () => {
  const rows = [row({ id: 1 }), row({ id: 2, content: body }), row({ id: 3 }), row({ id: 4 }), row({ id: 5 })]
  assert.deepEqual(pickVideoRows(rows, [], NOW).map((p) => p.row.id), [1, 3, 4]) // 2 has no credited photo
  assert.equal(pickVideoRows(rows, [], NOW).length, VIDEO_STORY_TRIES)
  assert.deepEqual(pickVideoRows(rows, [], NOW, 1).map((p) => p.row.id), [1])
  assert.equal(pickVideoRow(rows, [], NOW)?.row.id, 1)
  const log = [logEntry({ id: videoLogId(1) })]
  assert.deepEqual(pickVideoRows(rows, log, NOW).map((p) => p.row.id), [3, 4, 5])
})

test('the writer is asked for a headline with a margin under the hard limit', () => {
  assert.ok(VIDEO_HEADLINE_ASK < VIDEO_HEADLINE_MAX)
  const { system } = buildWordsPrompt({ title: 't', excerpt: 'e', url: 'https://newsedition.in/article/s', tags: [], categorySlug: null, categoryName: null, imageUrl: null, content: '<p>x</p>' })
  assert.match(system, new RegExp(`20 to ${VIDEO_HEADLINE_ASK} characters`))
  assert.match(system, new RegExp(`over ${VIDEO_HEADLINE_MAX} is rejected`))
})

test('the narrator reads the headline and the three points, one sentence each, and stays short', () => {
  const words = { headline: 'RBI keeps repo rate at 5.5%', points: ['The central bank held the rate on Friday.', 'Home loan EMIs stay the same!', 'Next review is in December'] }
  const text = voiceScript(words)
  assert.equal(text, 'RBI keeps repo rate at 5.5%. The central bank held the rate on Friday. Home loan EMIs stay the same. Next review is in December.')
  // no doubled stops, no stray spaces, nothing that is not on the frames
  assert.doesNotMatch(text, /[.!?]{2}|\s{2}/)
  // at the longest allowed frame text it is still under the 1500 characters speak() accepts and about 20 s of speech
  const longest = voiceScript({ headline: 'h'.repeat(56), points: ['p'.repeat(70), 'p'.repeat(70), 'p'.repeat(70)] })
  assert.ok(longest.length < 1500)
})

// ── the Hindi narration ─────────────────────────────────────────────────────

const frameText = { headline: 'RBI holds the repo rate at 5.5%', points: ['The central bank decided on Friday', 'Home loan EMIs stay the same', 'The next review is in December'] }
const hindiLines = ['आरबीआई ने रेपो रेट साढ़े पाँच प्रतिशत पर ही रखा।', 'केंद्रीय बैंक ने यह फैसला शुक्रवार को सुनाया।', 'होम लोन लेने वालों की ईएमआई में कोई बदलाव नहीं होगा।', 'अगली समीक्षा दिसंबर में होगी।']

test('the Hindi writer is given only the four frame texts and told to spell numbers and acronyms out', () => {
  const { system, user } = buildHindiPrompt(frameText)
  for (const t of [frameText.headline, ...frameText.points]) assert.ok(user.includes(t))
  assert.match(system, /Devanagari/)
  assert.match(system, /spell every number out/)
  assert.match(system, /only the four lines given/)
  assert.match(system, /Do not name any news outlet/)
})

test('a Hindi narration of four lines in Devanagari passes', () => {
  assert.deepEqual(checkHindi(hindiLines), [])
  assert.deepEqual(hindiWordCounts(hindiLines), [10, 8, 11, 5])
})

test('a Hindi narration with digits, Latin letters, symbols, the wrong length or an exclamation mark is rejected', () => {
  const swap = (i: number, text: string) => hindiLines.map((l, j) => (j === i ? text : l))
  assert.ok(checkHindi(swap(0, 'आरबीआई ने रेपो रेट 5.5 प्रतिशत पर ही रखा।')).some((m) => /digits/.test(m)))
  assert.ok(checkHindi(swap(0, 'RBI ने रेपो रेट साढ़े पाँच प्रतिशत पर ही रखा।')).some((m) => /Latin/.test(m)))
  assert.ok(checkHindi(swap(0, 'आरबीआई ने रेपो रेट साढ़े पाँच % पर ही रखा।')).length > 0)
  assert.ok(checkHindi(swap(0, 'आरबीआई ने रेपो रेट ५.५ प्रतिशत पर ही रखा।')).length > 0) // Devanagari digits are read as unpredictably as Latin ones
  assert.ok(checkHindi(swap(3, 'दिसंबर में समीक्षा होगी!')).some((m) => /exclamation/.test(m)))
  assert.ok(checkHindi(hindiLines.slice(0, 3)).some((m) => /exactly 4 lines/.test(m)))
  assert.ok(checkHindi(swap(1, 'केंद्रीय बैंक ने।')).some((m) => /Line 2/.test(m)))
  assert.ok(checkHindi(swap(1, Array(21).fill('बैंक').join(' '))).some((m) => /Line 2/.test(m)))
  assert.ok(checkHindi(['एक दो तीन चार।', 'एक दो तीन चार।', 'एक दो तीन चार।', 'एक दो तीन चार।']).some((m) => /in all/.test(m)))
  assert.ok(checkHindi(['सब ठीक है।', 'सब ठीक है।', 'सब ठीक है।', 'सब ठीक है।']).some((m) => /in all/.test(m)))
})

test('the JSON of the Hindi writer must hold exactly four strings', () => {
  assert.deepEqual(parseHindi({ lines: ['  क   ख ', 'ग', 'घ', 'ङ'] }), ['क ख', 'ग', 'घ', 'ङ'])
  assert.equal(parseHindi({ lines: ['क', 'ख', 'ग'] }), null)
  assert.equal(parseHindi({ lines: ['क', 'ख', 'ग', 4] }), null)
  assert.equal(parseHindi({ lines: 'क ख ग घ' }), null)
  assert.equal(parseHindi(null), null)
})

test('the Hindi script ends every line with one danda and stays far under the 1500 characters speak() takes', () => {
  const text = hindiScript(['पहली पंक्ति.', 'दूसरी पंक्ति।', 'तीसरी पंक्ति ?', ' चौथी पंक्ति '])
  assert.equal(text, 'पहली पंक्ति। दूसरी पंक्ति। तीसरी पंक्ति। चौथी पंक्ति।')
  assert.doesNotMatch(text, /।।|\s{2}/)
  const word = 'क'.repeat(15)
  const longest = [15, 15, 14, 14].map((n) => Array(n).fill(word).join(' '))
  assert.equal(longest.reduce((n, l) => n + l.split(' ').length, 0), HINDI_TOTAL_WORDS.max)
  assert.ok(hindiScript(longest).length < 1500)
})

test('a rejected Hindi narration is written again with the reasons, and gives up after the second try', async () => {
  const seen: Message[][] = []
  const answers = [JSON.stringify({ lines: ['RBI ने रेपो रेट 5.5 प्रतिशत रखा।', hindiLines[1], hindiLines[2], hindiLines[3]] }), JSON.stringify({ lines: hindiLines })]
  const ok = await writeHindi(async (m) => { seen.push(m.map((x) => ({ ...x }))); return answers.shift() ?? null }, frameText)
  assert.deepEqual(ok.lines, hindiLines)
  assert.equal(seen.length, 2)
  assert.match(seen[1][seen[1].length - 1].content, /Rejected for:[\s\S]*digits/)

  const bad = JSON.stringify({ lines: ['RBI', 'RBI', 'RBI', 'RBI'] })
  const failed = await writeHindi(async () => bad, frameText)
  assert.equal(failed.lines, null)
  assert.ok(failed.issues.length > 0)
  assert.equal((await writeHindi(async () => null, frameText)).lines, null)
  assert.equal((await writeHindi(async () => 'not json', frameText)).lines, null)
})
