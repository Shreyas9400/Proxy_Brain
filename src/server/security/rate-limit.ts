// In-memory sliding-window rate limiter. Single-process, single-user Phase 1
// deployment — no Redis needed. Keyed by an arbitrary string (userId + route).
const hits = new Map<string, number[]>();

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function checkRateLimit(key: string, opts: RateLimitOptions): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  const existing = (hits.get(key) ?? []).filter((t) => t > windowStart);

  if (existing.length >= opts.max) {
    const retryAfterMs = existing[0] + opts.windowMs - now;
    hits.set(key, existing);
    return { allowed: false, retryAfterMs };
  }

  existing.push(now);
  hits.set(key, existing);
  return { allowed: true };
}
