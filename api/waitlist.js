const disposableDomains = new Set([
  '10minutemail.com',
  'guerrillamail.com',
  'mailinator.com',
  'tempmail.com',
  'yopmail.com',
])

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const rateLimitMax = Number(process.env.WAITLIST_RATE_LIMIT_MAX ?? 5)
const rateLimitWindowSeconds = Number(process.env.WAITLIST_RATE_LIMIT_WINDOW_SECONDS ?? 3600)
let redisClientPromise

module.exports = async function waitlistHandler(request, response) {
  response.setHeader('Access-Control-Allow-Origin', '*')
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const body = parseBody(request.body)
  const email = normalizeEmail(body.email ?? '')
  const referredBy = normalizeReferral(body.referred_by)

  if (!isValidEmail(email)) {
    response.status(400).json({ error: 'Use a real email address so your player ID can reach you.' })
    return
  }

  if (!hasRedisConfig()) {
    response.status(503).json({
      error: 'Waitlist datastore is not configured yet. Connect Redis in Vercel Storage or add the Redis environment variables.',
    })
    return
  }

  try {
    const emailKey = `waitlist:email:${email}`
    const existing = await redisCommand(['GET', emailKey])

    if (existing) {
      response.status(200).json({ ...JSON.parse(existing), success: true })
      return
    }

    await enforceRateLimit(request)

    const signup = createSignup(email, referredBy, request)
    await saveSignup(emailKey, signup, email)

    response.status(200).json({ ...signup, success: true })
  } catch (error) {
    console.error(error)
    response.status(error.statusCode ?? 500).json({ error: error.message ?? 'Unable to save your player ID right now.' })
  }
}

function parseBody(body) {
  if (typeof body !== 'string') {
    return body ?? {}
  }

  try {
    return JSON.parse(body)
  } catch {
    return {}
  }
}

function createSignup(email, referredBy, request) {
  const seed = stableCode(email)

  return {
    email,
    display_id: `DHU-${seed.slice(0, 5)}`,
    referral_code: seed.slice(5, 11),
    referred_by: referredBy,
    platform_joined: 'web_waitlist',
    game: "Don't Hang Up",
    created_at: new Date().toISOString(),
    ip_hash: stableCode(getClientIp(request)).slice(0, 12),
  }
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase()
}

function normalizeReferral(referral) {
  return typeof referral === 'string' && /^[A-Z0-9]{6}$/i.test(referral) ? referral.toUpperCase() : null
}

function isValidEmail(email) {
  const domain = email.split('@')[1]
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && Boolean(domain && !disposableDomains.has(domain))
}

function stableCode(value) {
  const crypto = require('node:crypto')
  const digest = crypto.createHash('sha256').update(value).digest()
  let code = ''

  for (const byte of digest) {
    code += alphabet[byte % alphabet.length]
  }

  return code
}

function getClientIp(request) {
  return (
    request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    request.headers['x-real-ip'] ||
    request.socket?.remoteAddress ||
    'unknown'
  )
}

async function redisCommand(command) {
  if (hasRedisRestConfig()) {
    const [result] = await redisPipeline([command])
    return result
  }

  const client = await getRedisClient()
  const [operation, key, value] = command

  switch (operation) {
    case 'GET':
      return client.get(key)
    case 'SET':
      return client.set(key, value)
    case 'INCR':
      return client.incr(key)
    case 'EXPIRE':
      return client.expire(key, Number(value))
    case 'SADD':
      return client.sAdd(key, value)
    case 'LPUSH':
      return client.lPush(key, value)
    default:
      throw new Error(`Unsupported Redis command: ${operation}`)
  }
}

async function saveSignup(emailKey, signup, email) {
  if (hasRedisRestConfig()) {
    await redisPipeline([
      ['SET', emailKey, JSON.stringify(signup)],
      ['SET', `waitlist:player:${signup.display_id}`, email],
      ['SADD', 'waitlist:emails', email],
      ['LPUSH', 'waitlist:signups', JSON.stringify(signup)],
    ])
    return
  }

  const client = await getRedisClient()
  await client
    .multi()
    .set(emailKey, JSON.stringify(signup))
    .set(`waitlist:player:${signup.display_id}`, email)
    .sAdd('waitlist:emails', email)
    .lPush('waitlist:signups', JSON.stringify(signup))
    .exec()
}

async function enforceRateLimit(request) {
  const ipHash = stableCode(getClientIp(request)).slice(0, 12)
  const key = `waitlist:rate:${ipHash}`
  let count

  if (hasRedisRestConfig()) {
    ;[count] = await redisPipeline([
      ['INCR', key],
      ['EXPIRE', key, rateLimitWindowSeconds],
    ])
  } else {
    const client = await getRedisClient()
    const results = await client.multi().incr(key).expire(key, rateLimitWindowSeconds).exec()
    count = results[0]
  }

  if (Number(count) > rateLimitMax) {
    const error = new Error('Too many signup attempts from this connection. Try again later.')
    error.statusCode = 429
    throw error
  }
}

async function redisPipeline(commands) {
  const url = process.env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '')
  const response = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  })

  if (!response.ok) {
    throw new Error(`Datastore request failed: ${response.status}`)
  }

  const results = await response.json()
  return results.map((item) => item.result)
}

function hasRedisRestConfig() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

function getRedisUrl() {
  return process.env.WAITLIST_REDIS_REDIS_URL || process.env.REDIS_URL || ''
}

function hasRedisConfig() {
  return hasRedisRestConfig() || Boolean(getRedisUrl())
}

async function getRedisClient() {
  if (!redisClientPromise) {
    const { createClient } = require('redis')
    const client = createClient({ url: getRedisUrl() })
    client.on('error', (error) => console.error('Redis client error', error))
    redisClientPromise = client.connect().then(() => client)
  }

  return redisClientPromise
}
