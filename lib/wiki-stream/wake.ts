// Fixed, public endpoint: callers cannot supply an arbitrary fetch destination.
export const WORKER_HEALTH_URL = "https://priyankpatil.onrender.com/health";

export type WorkerWakeStatus = "responding" | "starting" | "unavailable";

export async function wakeWorker(fetcher: typeof fetch = fetch): Promise<WorkerWakeStatus> {
  try {
    const response = await fetcher(WORKER_HEALTH_URL, {
      method: "GET", cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (response.status === 403 || response.status === 404 || response.status === 429) return "unavailable";
    // Render may return a loading page while the free instance starts. The
    // incoming HTTP request is sufficient to trigger a wake; never redeploy it.
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return "starting";
    const health = await response.json() as { ready?: boolean };
    return health.ready === true ? "responding" : "starting";
  } catch (error) {
    // A cold start can take longer than this server request's budget. Let normal
    // feed polling detect recovery instead of holding a Vercel function open.
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return "starting";
    return "unavailable";
  }
}
