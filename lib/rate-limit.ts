// Fixed-window rate limiter for public API routes.
//
// Uses Upstash Redis (REST API, no SDK needed) when UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN are set, so limits hold across serverless instances.
// Falls back to an in-memory map otherwise — fine for local dev, but only
// per-instance in production.

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
}

const memory = new Map<string, { count: number; resetAt: number }>();

function limitInMemory(key: string, limit: number, windowSeconds: number): RateLimitResult {
  const now = Date.now();
  const entry = memory.get(key);

  if (!entry || entry.resetAt <= now) {
    // Opportunistic cleanup so the map can't grow without bound.
    if (memory.size > 5000) {
      for (const [k, v] of memory) if (v.resetAt <= now) memory.delete(k);
    }
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, remaining: limit - 1, resetSeconds: windowSeconds };
  }

  entry.count += 1;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetSeconds: Math.ceil((entry.resetAt - now) / 1000),
  };
}

async function limitInRedis(
  url: string,
  token: string,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR", key],
      ["EXPIRE", key, String(windowSeconds), "NX"],
      ["TTL", key],
    ]),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Upstash responded ${res.status}`);

  const [incr, , ttl] = (await res.json()) as { result: number }[];
  const count = incr.result;
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetSeconds: ttl.result > 0 ? ttl.result : windowSeconds,
  };
}

export async function rateLimit(
  identifier: string,
  { limit, windowSeconds, prefix }: { limit: number; windowSeconds: number; prefix: string }
): Promise<RateLimitResult> {
  const key = `ratelimit:${prefix}:${identifier}`;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      return await limitInRedis(url, token, key, limit, windowSeconds);
    } catch (err) {
      console.error("Rate limiter unavailable, falling back to in-memory:", err);
    }
  }
  return limitInMemory(key, limit, windowSeconds);
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
