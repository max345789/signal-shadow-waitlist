import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0'
import { createMemoryRateLimiter, createUpstashRateLimiter, rateLimitHeaders } from '../_shared/rate-limit.ts'

type UserRow = {
  email: string
  display_id: string
  referral_code: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const disposableDomains = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'tempmail.com',
  'yopmail.com',
])

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const waitlistLimiter = getRateLimiter()

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const ip = getClientIp(request)
  const limit = await waitlistLimiter.check(`${request.method}:${ip}`)
  if (!limit.allowed) {
    return json(
      { error: 'Too many requests. Try again later.' },
      429,
      rateLimitHeaders(limit),
    )
  }

  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const { email: rawEmail, referred_by } = await request.json()
    const email = normalizeEmail(String(rawEmail ?? ''))

    if (!isValidEmail(email)) {
      return json({ error: 'Invalid email address.' }, 400)
    }

    const referrer = typeof referred_by === 'string' && /^[A-Z0-9]{6}$/i.test(referred_by)
      ? referred_by.toUpperCase()
      : null

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const existing = await findExistingUser(supabase, email)
    if (existing) {
      return json({ ...existing, success: true })
    }

    const inserted = await insertUserWithRetries(supabase, email, referrer)
    await sendConfirmationEmail(email, inserted.display_id, inserted.referral_code)

    return json({ ...inserted, success: true })
  } catch (error) {
    console.error(error)
    return json({ error: 'Unable to complete signup.' }, 500)
  }
})

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function isValidEmail(email: string): boolean {
  const domain = email.split('@')[1]
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && Boolean(domain && !disposableDomains.has(domain))
}

async function findExistingUser(supabase: ReturnType<typeof createClient>, email: string): Promise<UserRow | null> {
  const { data, error } = await supabase
    .from('users')
    .select('email, display_id, referral_code')
    .eq('email', email)
    .maybeSingle()

  if (error) {
    throw error
  }

  return data
}

async function insertUserWithRetries(
  supabase: ReturnType<typeof createClient>,
  email: string,
  referredBy: string | null,
): Promise<UserRow> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const row = {
      email,
      display_id: `SW-${randomCode(5)}`,
      referral_code: randomCode(6),
      referred_by: referredBy,
    }

    const { data, error } = await supabase
      .from('users')
      .insert(row)
      .select('email, display_id, referral_code')
      .single()

    if (!error && data) {
      return data
    }

    if (!isUniqueViolation(error)) {
      throw error
    }
  }

  throw new Error('Unable to generate unique IDs.')
}

function randomCode(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505'
}

async function sendConfirmationEmail(email: string, displayId: string, referralCode: string): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('WAITLIST_FROM_EMAIL') ?? 'Maxwel Game Studio <waitlist@example.com>'
  const siteUrl = Deno.env.get('SITE_URL') ?? 'https://yoursite.com'

  if (!apiKey) {
    console.warn('RESEND_API_KEY is not set; skipping confirmation email.')
    return
  }

  const referralLink = `${siteUrl.replace(/\/$/, '')}/?ref=${referralCode}`
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: email,
      subject: 'Your Signal & Shadow player ID',
      html: `
        <p>You are on the Signal & Shadow waitlist.</p>
        <p><strong>${displayId}</strong></p>
        <p>Save this. It is your login when the game launches.</p>
        <p>Referral link: <a href="${referralLink}">${referralLink}</a></p>
      `,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Resend failed: ${response.status} ${body}`)
  }
}

function getClientIp(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

function getRateLimiter() {
  const limit = Number(Deno.env.get('WAITLIST_RATE_LIMIT_MAX') ?? 5)
  const windowSeconds = Number(Deno.env.get('WAITLIST_RATE_LIMIT_WINDOW_SECONDS') ?? 3600)
  const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL')
  const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN')

  if (redisUrl && redisToken) {
    return createUpstashRateLimiter({
      limit,
      windowSeconds,
      redisUrl,
      redisToken,
    })
  }

  return createMemoryRateLimiter({
    limit,
    windowMs: windowSeconds * 1000,
  })
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...headers,
      'Content-Type': 'application/json',
    },
  })
}
