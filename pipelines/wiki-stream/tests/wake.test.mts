import test from "node:test";
import assert from "node:assert/strict";
import { wakeWorker, WORKER_HEALTH_URL } from "../../../lib/wiki-stream/wake.ts";
import { shouldAutoWake } from "../../../lib/wiki-stream/wake-policy.ts";
import { initialState, makeFrame } from "../src/state.ts";

test("waking requests only the public worker health URL with a bounded wait and no credentials", async () => {
  const fetcher = (async (url: string | URL | Request, options?: RequestInit) => {
    assert.equal(url, WORKER_HEALTH_URL);
    assert.equal(options?.method, "GET"); assert.equal(options?.cache, "no-store");
    assert.ok(options?.signal instanceof AbortSignal); assert.equal(options?.headers, undefined);
    return Response.json({ ready: true });
  }) as typeof fetch;
  assert.equal(await wakeWorker(fetcher), "responding");
});

test("a loading page or cold-start timeout permits feed polling to continue", async () => {
  assert.equal(await wakeWorker((async () => new Response("Starting", { headers: { "Content-Type": "text/html" } })) as typeof fetch), "starting");
  assert.equal(await wakeWorker((async () => { throw new DOMException("Timed out", "TimeoutError"); }) as typeof fetch), "starting");
  assert.equal(await wakeWorker((async () => Response.json({ ready: false }, { status: 503 })) as typeof fetch), "starting");
});

test("unreachable or denied services report failure without throwing", async () => {
  assert.equal(await wakeWorker((async () => { throw new TypeError("Network failure"); }) as typeof fetch), "unavailable");
  assert.equal(await wakeWorker((async () => new Response(null, { status: 403 })) as typeof fetch), "unavailable");
});

test("automatic wake targets stale feed data, not fresh data, missing setup or read budgets", () => {
  const now = Date.now(); const fresh = makeFrame(initialState(now), 0, now);
  const old = { ...fresh, at: now - 31_000 };
  assert.equal(shouldAutoWake({ mode: "live", frame: fresh }, now), false);
  assert.equal(shouldAutoWake({ mode: "live", frame: old }, now), true);
  assert.equal(shouldAutoWake({ mode: "stale", frame: old }, now), true);
  assert.equal(shouldAutoWake({ mode: "stale", frame: fresh }, now), true); // server freshness wins over a skewed browser clock
  for (const mode of ["budget", "preview", "unavailable"] as const) assert.equal(shouldAutoWake({ mode, frame: old }, now), false);
  assert.equal(shouldAutoWake({ mode: "unavailable", frame: null }, now), false);
});
