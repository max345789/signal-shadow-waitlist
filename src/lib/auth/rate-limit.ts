import { getRedisClient } from "@/lib/queues/redis";

interface MemoryBucket {
  count: number;
  resetAt: number;
}

const memoryBuckets = new Map<string, MemoryBucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<RateLimitResult> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const namespacedKey = `trust-marketplace:ratelimit:${key}`;
      const count = await redis.incr(namespacedKey);
      if (count === 1) {
        await redis.pexpire(namespacedKey, windowMs);
      }
      const ttlMs = Math.max(0, await redis.pttl(namespacedKey));
      if (count > maxAttempts) {
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)),
        };
      }
      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - count),
        retryAfterSeconds: 0,
      };
    } catch {
      // Fall back to in-memory limiter if Redis connection is unavailable
    }
  }

  const now = Date.now();
  const existing = memoryBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    memoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return {
      allowed: true,
      remaining: Math.max(0, maxAttempts - 1),
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  if (existing.count > maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(0, maxAttempts - existing.count),
    retryAfterSeconds: 0,
  };
}

export function resetMemoryRateLimitsForTest(): void {
  memoryBuckets.clear();
}
