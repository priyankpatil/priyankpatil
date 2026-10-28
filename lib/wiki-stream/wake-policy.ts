import type { WikiResponse } from "./types";

export function shouldAutoWake(response: WikiResponse, now = Date.now()): boolean {
  // Missing configuration, read-budget exhaustion and database failures are not
  // evidence of an idle worker. Only automatically wake for stale stored data.
  return Boolean(response.frame && (response.mode === "stale" || (response.mode === "live" && now - response.frame.at > 30_000)));
}
