import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "../../../app/api/wiki-stream/wake/route.ts";
import { WORKER_HEALTH_URL } from "../../../lib/wiki-stream/wake.ts";

test("wake route denies cross-origin calls and rate-limits repeated public health requests", async () => {
  const original = globalThis.fetch;
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  let calls = 0;
  globalThis.fetch = (async (url) => {
    assert.equal(url, WORKER_HEALTH_URL); calls++;
    return Response.json({ ready: true });
  }) as typeof fetch;
  try {
    const blocked = await POST(new Request("https://example.com/api/wiki-stream/wake", {
      method: "POST", headers: { Origin: "https://other.example", "x-forwarded-for": "203.0.113.20" },
    }));
    assert.equal(blocked.status, 403); assert.equal(calls, 0);
    for (let i = 0; i < 3; i++) {
      const allowed = await POST(new Request("https://example.com/api/wiki-stream/wake", {
        method: "POST", headers: { Origin: "https://example.com", "x-forwarded-for": "203.0.113.21" },
        body: JSON.stringify({ url: "http://169.254.169.254/" }),
      }));
      assert.equal(allowed.status, 202); assert.equal(allowed.headers.get("cache-control"), "no-store");
    }
    const limited = await POST(new Request("https://example.com/api/wiki-stream/wake", {
      method: "POST", headers: { "x-forwarded-for": "203.0.113.21" },
    }));
    assert.equal(limited.status, 429); assert.ok(Number(limited.headers.get("retry-after")) > 0);
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = original;
    if (redisUrl !== undefined) process.env.UPSTASH_REDIS_REST_URL = redisUrl;
    if (redisToken !== undefined) process.env.UPSTASH_REDIS_REST_TOKEN = redisToken;
  }
});
