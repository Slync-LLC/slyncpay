import type { Context, Next } from "hono";
import { getRedis } from "./redis.js";
import { ApiError } from "./errors.js";

export interface RateLimitConfig {
  windowSeconds: number;
  maxRequests: number;
  keyPrefix: string;
  // Override how the key is derived from the request (default: IP)
  keyFn?: (c: Context) => Promise<string> | string;
}

function clientIp(c: Context): string {
  const forwarded = c.req.header("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return c.req.header("X-Real-IP") ?? "unknown";
}

/**
 * Sliding-window rate limiter backed by Redis sorted sets.
 * Counts requests in the trailing `windowSeconds` for a given key.
 */
async function checkLimit(key: string, windowSeconds: number, max: number): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();
  const now = Date.now();
  const windowStart = now - windowSeconds * 1000;
  const member = `${now}:${Math.random().toString(36).slice(2, 8)}`;

  const pipeline = redis.multi();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, member);
  pipeline.zcard(key);
  pipeline.expire(key, windowSeconds);
  const results = await pipeline.exec();

  // results: [[err, count], ...]; index 2 is zcard
  const count = Number(results?.[2]?.[1] ?? 0);
  return {
    allowed: count <= max,
    remaining: Math.max(0, max - count),
    resetAt: now + windowSeconds * 1000,
  };
}

export function rateLimit(cfg: RateLimitConfig) {
  return async (c: Context, next: Next) => {
    const idPart = cfg.keyFn ? await cfg.keyFn(c) : clientIp(c);
    const key = `rl:${cfg.keyPrefix}:${idPart}`;
    const { allowed, remaining, resetAt } = await checkLimit(key, cfg.windowSeconds, cfg.maxRequests);

    c.header("X-RateLimit-Limit", String(cfg.maxRequests));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.floor(resetAt / 1000)));

    if (!allowed) {
      throw new ApiError(429, "rate_limited", "Too many requests. Please slow down and try again later.");
    }

    await next();
  };
}

/** Direct programmatic check without middleware (for branching logic). */
export async function checkRateLimit(prefix: string, id: string, windowSeconds: number, max: number) {
  return checkLimit(`rl:${prefix}:${id}`, windowSeconds, max);
}

/**
 * Failed-login lockout. Increments a counter that lives for `windowSeconds`.
 * Returns whether the identifier is currently locked.
 */
export async function recordFailedLogin(identifier: string, windowSeconds = 900): Promise<{ locked: boolean; failures: number }> {
  const redis = getRedis();
  const key = `lockout:${identifier}`;
  const failures = await redis.incr(key);
  if (failures === 1) await redis.expire(key, windowSeconds);
  return { locked: failures >= 5, failures };
}

export async function isLockedOut(identifier: string): Promise<boolean> {
  const redis = getRedis();
  const failures = Number(await redis.get(`lockout:${identifier}`)) || 0;
  return failures >= 5;
}

export async function clearFailedLogins(identifier: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`lockout:${identifier}`);
}

export { clientIp };
