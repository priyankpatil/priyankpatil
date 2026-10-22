// TypeScript mirror of cx_eval.validate_batch (supabase/migrations/
// 20261022000000_cx_eval.sql), for the demo only: the pipeline itself runs
// these checks in SQL. Same check names, severities and null semantics: a
// check that depends on a missing field passes, because missing_field
// already reports it.

const REQUIRED = ["conversation_id", "started_at", "channel", "agent_id", "logged_reason", "customer", "transcript"];
const CHANNELS = ["web_chat", "app_chat"];
const SPEAKERS = ["agent", "customer", "action"];

export interface CheckResult {
  name: string;
  severity: "error" | "warn";
  rule: string;
  passed: boolean;
  detail?: string;
}

function parseTimestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateRecord(
  payload: Record<string, unknown>,
  { convoId, batchDate, knownReasons }: { convoId: string; batchDate: string; knownReasons: ReadonlySet<string> }
): { checks: CheckResult[]; quarantined: boolean } {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(payload, k);
  const missing = REQUIRED.filter((k) => !has(k));
  const unexpected = Object.keys(payload).filter((k) => !REQUIRED.includes(k));
  const started = parseTimestamp(payload.started_at);
  const transcript = payload.transcript;
  const badTurns = Array.isArray(transcript)
    ? transcript.filter((t) => {
        const turn = (t ?? {}) as Record<string, unknown>;
        const speaker = typeof turn.speaker === "string" ? turn.speaker : "";
        return (
          !SPEAKERS.includes(speaker) ||
          !turn.text ||
          (speaker === "action" && !turn.button)
        );
      }).length
    : 0;

  const checks: CheckResult[] = [
    {
      name: "missing_field",
      severity: "error",
      rule: "All seven contract fields are present",
      passed: missing.length === 0,
      detail: missing.length ? `missing: ${missing.join(", ")}` : undefined,
    },
    {
      name: "unexpected_field",
      severity: "warn",
      rule: "No fields outside the contract",
      passed: unexpected.length === 0,
      detail: unexpected.length ? `unexpected: ${unexpected.join(", ")}` : undefined,
    },
    {
      name: "id_mismatch",
      severity: "error",
      rule: "conversation_id matches the record key",
      passed: !has("conversation_id") || payload.conversation_id === convoId,
      detail: has("conversation_id") && payload.conversation_id !== convoId ? `payload conversation_id ${String(payload.conversation_id)}` : undefined,
    },
    {
      name: "bad_timestamp",
      severity: "error",
      rule: "started_at is a timestamp",
      passed: !has("started_at") || started !== null,
      detail: has("started_at") && !started ? `started_at not a timestamp: ${String(payload.started_at).slice(0, 40)}` : undefined,
    },
    {
      name: "wrong_batch",
      severity: "error",
      rule: "started_at falls on the batch date",
      passed: !started || started.toISOString().slice(0, 10) === batchDate,
      detail: started && started.toISOString().slice(0, 10) !== batchDate ? `started_at is outside batch ${batchDate}` : undefined,
    },
    {
      name: "unknown_channel",
      severity: "error",
      rule: "channel is web_chat or app_chat",
      passed: !has("channel") || CHANNELS.includes(String(payload.channel)),
      detail: has("channel") && !CHANNELS.includes(String(payload.channel)) ? `channel ${String(payload.channel)}` : undefined,
    },
    {
      name: "unknown_reason",
      severity: "error",
      rule: "logged_reason is a known contact reason",
      passed: !has("logged_reason") || knownReasons.has(String(payload.logged_reason)),
      detail: has("logged_reason") && !knownReasons.has(String(payload.logged_reason)) ? `logged_reason ${String(payload.logged_reason)}` : undefined,
    },
    {
      name: "empty_transcript",
      severity: "error",
      rule: "transcript is a non-empty list",
      passed: !has("transcript") || (Array.isArray(transcript) && transcript.length > 0),
      detail: has("transcript") && !(Array.isArray(transcript) && transcript.length > 0) ? "transcript is empty or not a list" : undefined,
    },
    {
      name: "bad_turn",
      severity: "error",
      rule: "Every turn has a known speaker and text; actions carry a button id",
      passed: badTurns === 0,
      detail: badTurns ? `${badTurns} malformed turn(s)` : undefined,
    },
  ];
  return { checks, quarantined: checks.some((c) => c.severity === "error" && !c.passed) };
}
