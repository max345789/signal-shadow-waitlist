import { describe, expect, it } from 'vitest'
import { createMemoryRateLimiter } from '../../supabase/functions/_shared/rate-limit'

describe('memory rate limiter', () => {
  it('blocks requests after the configured limit until the window resets', async () => {
    let now = 1_000
    const limiter = createMemoryRateLimiter({
      limit: 2,
      windowMs: 1_000,
      now: () => now,
    })

    expect(await limiter.check('signup:127.0.0.1')).toMatchObject({ allowed: true, remaining: 1 })
    expect(await limiter.check('signup:127.0.0.1')).toMatchObject({ allowed: true, remaining: 0 })

    const blocked = await limiter.check('signup:127.0.0.1')
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(1)

    now = 2_001
    expect(await limiter.check('signup:127.0.0.1')).toMatchObject({ allowed: true, remaining: 1 })
  })
})
