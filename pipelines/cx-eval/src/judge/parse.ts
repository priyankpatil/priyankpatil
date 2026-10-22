import { FLOW_IDS, type Flow, type JudgeOutput, type PassFail, type PassFailNa, type Resolution } from "../contract.ts";

// Turns a judge model's reply into a JudgeOutput, or a precise error that the
// repair round can hand back to the model. Coercion is limited to variants
// whose meaning is unambiguous (case, whitespace, "N/A", a quoted integer);
// anything else is rejected so a bad label never reaches cx_eval.scores.

export type ParseResult = { ok: true; value: JudgeOutput } | { ok: false; error: string };

const EVIDENCE_KEYS = ["intent", "identity_verification", "policy_adherence", "resolution", "empathy"] as const;
const PASS_FAIL: readonly PassFail[] = ["pass", "fail"];
const PASS_FAIL_NA: readonly PassFailNa[] = ["pass", "fail", "na"];
const RESOLUTIONS: readonly Resolution[] = ["resolved", "partial", "unresolved"];
const NA_VARIANTS = new Set(["na", "n/a", "n.a.", "not applicable", "not_applicable", "not-applicable"]);

/**
 * Every balanced top-level {...} span in the text, skipping braces inside
 * JSON strings. Reasoning models sometimes put prose (even braces) before the
 * answer, so the caller tries the spans rather than trusting the first "{".
 */
function objectSpans(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"' && depth > 0) inString = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}" && depth > 0) {
      depth--;
      if (depth === 0) spans.push(text.slice(start, i + 1));
    }
  }
  return spans;
}

function extractJson(text: string): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!text.trim()) return { ok: false, error: "The response was empty; expected a single JSON object." };
  // Fenced blocks first: if the model fenced its answer, that is the answer.
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1]);
  const candidates = [...fenced.flatMap(objectSpans), ...objectSpans(text)];
  const parsed: Record<string, unknown>[] = [];
  let lastError = "";
  for (const candidate of candidates) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) parsed.push(value as Record<string, unknown>);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }
  // Prefer the object that looks like an answer (has "intent"); the last one, since answers come after reasoning.
  const answer = parsed.filter((v) => "intent" in v).at(-1) ?? parsed.at(-1);
  if (answer) return { ok: true, value: answer };
  if (candidates.length) return { ok: false, error: `The JSON object could not be parsed: ${lastError}.` };
  if (text.includes("{")) return { ok: false, error: "The JSON object was never closed; the reply may have been cut off." };
  return { ok: false, error: "No JSON object was found in the response." };
}

function normalizeLabel(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim().toLowerCase() : undefined;
}

function describe(value: unknown): string {
  return value === undefined ? "missing" : JSON.stringify(value);
}

// Each field parser returns the value, or an error message for the repair prompt.
type Field<T> = { value: T } | { error: string };

function parseIntent(value: unknown): Field<Flow> {
  // "Product Defect" and "product-defect" are the same label as product_defect.
  const label = normalizeLabel(value)?.replace(/[\s-]+/g, "_");
  if (label && (FLOW_IDS as string[]).includes(label)) return { value: label as Flow };
  return { error: `"intent" must be one of ${FLOW_IDS.join(", ")}; got ${describe(value)}.` };
}

function parseEnum<T extends string>(field: string, value: unknown, allowed: readonly T[]): Field<T> {
  const label = normalizeLabel(value);
  if (label !== undefined) {
    if ((allowed as readonly string[]).includes(label)) return { value: label as T };
    if (allowed.includes("na" as T) && NA_VARIANTS.has(label)) return { value: "na" as T };
  }
  return { error: `"${field}" must be one of ${allowed.map((o) => `"${o}"`).join(", ")}; got ${describe(value)}.` };
}

function parseEmpathy(value: unknown): Field<number> {
  const n = typeof value === "number" ? value : typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : NaN;
  if (Number.isInteger(n) && n >= 1 && n <= 5) return { value: n };
  return { error: `"empathy" must be an integer from 1 to 5; got ${describe(value)}.` };
}

function parseEvidence(value: unknown): Field<JudgeOutput["evidence"]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { error: `"evidence" must be an object with string keys ${EVIDENCE_KEYS.join(", ")}; got ${describe(value)}.` };
  }
  const evidence: Partial<JudgeOutput["evidence"]> = {};
  const errors: string[] = [];
  for (const key of EVIDENCE_KEYS) {
    const text = (value as Record<string, unknown>)[key];
    if (typeof text === "string" && text.trim()) evidence[key] = text.trim();
    else errors.push(`"evidence.${key}" must be a non-empty string; got ${describe(text)}.`);
  }
  return errors.length ? { error: errors.join(" ") } : { value: evidence as JudgeOutput["evidence"] };
}

/** Parses and strictly validates a judge reply. Unknown extra keys are dropped, not rejected. */
export function parseJudgeOutput(text: string): ParseResult {
  const extracted = extractJson(text);
  if (!extracted.ok) return extracted;
  const raw = extracted.value;

  const fields = {
    intent: parseIntent(raw.intent),
    identity_verification: parseEnum<PassFailNa>("identity_verification", raw.identity_verification, PASS_FAIL_NA),
    policy_adherence: parseEnum<PassFail>("policy_adherence", raw.policy_adherence, PASS_FAIL),
    resolution: parseEnum<Resolution>("resolution", raw.resolution, RESOLUTIONS),
    empathy: parseEmpathy(raw.empathy),
    evidence: parseEvidence(raw.evidence),
  };
  const errors = Object.values(fields).flatMap((f) => ("error" in f ? [f.error] : []));
  if (errors.length) return { ok: false, error: errors.join(" ") };

  const get = <T,>(f: Field<T>) => (f as { value: T }).value;
  return {
    ok: true,
    value: {
      intent: get(fields.intent),
      identity_verification: get(fields.identity_verification),
      policy_adherence: get(fields.policy_adherence),
      resolution: get(fields.resolution),
      empathy: get(fields.empathy),
      evidence: get(fields.evidence),
    },
  };
}
