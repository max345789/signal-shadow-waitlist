export type RateLimitResult = {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
  resetAt: number
}

type MemoryRateLimiterOptions = {
  limit: number
  windowMs: number
  now?: () => number
}

type UpstashRateLimiterOptions = {
  limit: number
  windowSeconds: number
  redisUrl: string
  redisToken: string
  fetchImpl?: typeof fetch
  now?: () => number
}

const memoryBuckets = new Map<string, number[]>()

export function createMemoryRateLimiter({ limit, windowMs, now = Date.now }: MemoryRateLimiterOptions) {
  return {
    async check(key: string): Promise<RateLimitResult> {
      const currentTime = now()
      const windowStart = currentTime - windowMs
      const recent = (memoryBuckets.get(key) ?? []).filter((timestamp) => timestamp > windowStart)
      const oldest = recent[0] ?? currentTime
      const resetAt = oldest + windowMs

      if (recent.length >= limit) {
        memoryBuckets.set(key, recent)
        return {
          allowed: false,
          limit,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((resetAt - currentTime) / 1000)),
          resetAt,
        }
      }

      recent.push(currentTime)
      memoryBuckets.set(key, recent)

      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - recent.length),
        retryAfterSeconds: 0,
        resetAt,
      }
    },
  }
}

export function createUpstashRateLimiter({
  limit,
  windowSeconds,
  redisUrl,
  redisToken,
  fetchImpl = fetch,
  now = Date.now,
}: UpstashRateLimiterOptions) {
  return {
    async check(key: string): Promise<RateLimitResult> {
      const bucketKey = `ratelimit:${key}:${Math.floor(now() / (windowSeconds * 1000))}`
      const response = await fetchImpl(`${redisUrl.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([
          ['INCR', bucketKey],
          ['EXPIRE', bucketKey, windowSeconds],
          ['TTL', bucketKey],
        ]),
      })

      if (!response.ok) {
        throw new Error(`Rate limit store unavailable: ${response.status}`)
      }

      const [countResult, , ttlResult] = await response.json()
      const count = Number(countResult?.result ?? limit + 1)
      const ttl = Math.max(1, Number(ttlResult?.result ?? windowSeconds))

      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: count > limit ? ttl : 0,
        resetAt: now() + ttl * 1000,
      }
    },
  }
}

export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'Retry-After': result.retryAfterSeconds.toString(),
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  }
}
