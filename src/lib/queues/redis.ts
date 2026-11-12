import Redis from "ioredis";

export type QueueName =
  | "metric-refresh"
  | "match-alerts"
  | "virus-scan"
  | "notifications";

export interface QueueJobPayload {
  "metric-refresh": { businessId: string; verificationId: string };
  "match-alerts": { listingId: string; thesisIds: string[] };
  "virus-scan": { documentId: string; storageKey: string };
  notifications: { userId: string; type: string; title: string; body: string };
}

let redisClient: Redis | null = null;

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL && process.env.REDIS_URL.trim().length > 0);
}

export function getRedisClient(): Redis | null {
  if (!isRedisConfigured()) {
    return null;
  }
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
  }
  return redisClient;
}

export async function enqueueJob<K extends QueueName>(
  queue: K,
  payload: QueueJobPayload[K]
): Promise<{ queued: boolean; mode: "redis" | "unconfigured" }> {
  const client = getRedisClient();
  if (!client) {
    return { queued: false, mode: "unconfigured" };
  }
  const message = JSON.stringify({
    queue,
    payload,
    enqueuedAt: new Date().toISOString(),
  });
  await client.lpush(`trust-marketplace:queue:${queue}`, message);
  return { queued: true, mode: "redis" };
}
