import { NextRequest, NextResponse } from 'next/server'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

// Basic per-IP throttle. In-memory, so per-serverless-instance — a light
// first line of defense; MailerLite dedupes/upserts on its side anyway.
const attempts = new Map<string, { count: number; resetAt: number }>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 5

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count++
  return entry.count > MAX_PER_WINDOW
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.MAILERLITE_API_KEY
    if (!apiKey) {
      console.error('MAILERLITE_API_KEY not configured')
      return NextResponse.json({ error: 'Newsletter is not available right now' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    // Honeypot — bots fill every field; humans never see this one
    if (body.website) {
      return NextResponse.json({ success: true })
    }

    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    if (isRateLimited(ip)) {
      return NextResponse.json({ error: 'Too many attempts — please try again in a minute' }, { status: 429 })
    }

    const groupId = process.env.MAILERLITE_GROUP_ID
    const res = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email,
        ...(groupId ? { groups: [groupId] } : {}),
      }),
    })

    if (res.status === 200 || res.status === 201) {
      // 200 = already existed (upserted into group), 201 = new subscriber
      return NextResponse.json({ success: true })
    }

    if (res.status === 422) {
      return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
    }

    console.error('MailerLite error:', res.status, await res.text().catch(() => ''))
    return NextResponse.json({ error: 'Something went wrong — please try again' }, { status: 502 })
  } catch (error) {
    console.error('Newsletter signup error:', error)
    return NextResponse.json({ error: 'Something went wrong — please try again' }, { status: 500 })
  }
}
