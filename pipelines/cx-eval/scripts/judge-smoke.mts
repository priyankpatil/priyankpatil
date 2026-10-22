// Smoke test for the LLM judge against real ABCD conversations.
//
//   set -a; source .env; set +a   # NVIDIA_API_KEY
//   npx tsx pipelines/cx-eval/scripts/judge-smoke.mts [--model id] [--n 6] [--data <abcd dir>]
//
// --data (or CXEVAL_ABCD_DIR) is the folder holding abcd_v1.1.json and kb.json.
// Picks N test-split conversations, one per flow in turn so intents vary,
// scores them with judgeBatch and prints per-conversation telemetry and a
// summary. Uses rubric v1 if it exists, otherwise a minimal inline stub.
// Each conversation costs one or two API calls (two when repaired).

import { readFile } from "node:fs/promises";
import path from "node:path";
import { FLOW_IDS, FLOWS, type JudgeContext, type RubricVersion } from "../src/contract.ts";
import { judgeBatch, type JudgeResult } from "../src/judge/judge.ts";
import { NVIDIA_MODELS } from "../src/judge/nvidia.ts";

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const model = flag("model") ?? NVIDIA_MODELS.primary;
const n = Number(flag("n") ?? 6);
const dataDir = flag("data") ?? process.env.CXEVAL_ABCD_DIR;
if (!dataDir) {
  console.error("Pass --data <dir> or set CXEVAL_ABCD_DIR to the folder containing abcd_v1.1.json and kb.json.");
  process.exit(1);
}
if (!Number.isInteger(n) || n < 1) {
  console.error("--n must be a positive integer.");
  process.exit(1);
}
if (!process.env.NVIDIA_API_KEY) {
  console.error("Set NVIDIA_API_KEY (e.g. `set -a; source .env; set +a`).");
  process.exit(1);
}

interface AbcdConvo {
  convo_id: number;
  scenario: { flow: string; subflow: string };
  original: [string, string][];
}

const abcd = JSON.parse(await readFile(path.join(dataDir, "abcd_v1.1.json"), "utf8")) as Record<string, AbcdConvo[]>;
const kb = JSON.parse(await readFile(path.join(dataDir, "kb.json"), "utf8")) as Record<string, string[]>;

// Round-robin over flows so a small N still covers several intents.
const byFlow = new Map<string, AbcdConvo[]>();
for (const convo of abcd.test) byFlow.set(convo.scenario.flow, [...(byFlow.get(convo.scenario.flow) ?? []), convo]);
const picked: AbcdConvo[] = [];
for (let round = 0; picked.length < n; round++) {
  const before = picked.length;
  for (const flow of FLOW_IDS) {
    const convo = byFlow.get(flow)?.[round];
    if (convo && picked.length < n) picked.push(convo);
  }
  if (picked.length === before) break;
}

const SPEAKERS = new Set(["agent", "customer", "action"]);
const contexts: JudgeContext[] = picked.map((c) => ({
  convoId: String(c.convo_id),
  contactReason: c.scenario.subflow,
  policySteps: kb[c.scenario.subflow] ?? [],
  guideline: "",
  turns: c.original
    .filter(([speaker]) => SPEAKERS.has(speaker))
    .map(([speaker, text]) => ({ speaker: speaker as JudgeContext["turns"][number]["speaker"], text })),
}));
const trueFlow = new Map(picked.map((c) => [String(c.convo_id), c.scenario.flow]));

const stubRubric: RubricVersion = {
  version: "smoke-stub",
  buildPrompt(ctx) {
    const system = [
      "You evaluate customer-support conversations. Reply with one JSON object only, with exactly these keys:",
      `"intent": one of ${FLOW_IDS.map((f) => `${f} (${FLOWS[f]})`).join("; ")}.`,
      '"identity_verification": "pass" if the agent verified identity before account or order changes, "fail" if it skipped that, "na" if no verification was needed.',
      '"policy_adherence": "pass" or "fail": did the agent follow the policy steps in order?',
      '"resolution": "resolved", "partial" or "unresolved".',
      '"empathy": integer 1-5 for empathy and professionalism.',
      '"evidence": object with the same five keys, each a short quote or reason (at most 25 words).',
    ].join("\n");
    const user = [
      `Logged contact reason: ${ctx.contactReason}`,
      `Policy steps: ${ctx.policySteps.length ? ctx.policySteps.join(" -> ") : "(none)"}`,
      "Transcript:",
      ...ctx.turns.map((t) => `${t.speaker}: ${t.text}`),
    ].join("\n");
    return { system, user };
  },
};

async function loadRubric(): Promise<RubricVersion> {
  // A variable specifier keeps tsc from requiring the file to exist yet.
  const specifier = new URL("../src/rubric/v1.ts", import.meta.url).href;
  try {
    const mod = (await import(specifier)) as { rubricV1?: RubricVersion };
    if (mod.rubricV1) return mod.rubricV1;
    console.warn("rubric/v1.ts has no rubricV1 export; using the stub.");
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "ERR_MODULE_NOT_FOUND") console.warn(`Could not load rubric/v1.ts (${String(err)}); using the stub.`);
  }
  return stubRubric;
}

const rubric = await loadRubric();
console.log(`Judging ${contexts.length} conversations with ${model}, rubric ${rubric.version}\n`);

const started = Date.now();
const results = await judgeBatch(contexts, {
  rubric,
  model,
  onResult(r: JudgeResult) {
    const intent = r.output ? `${r.output.intent}${r.output.intent === trueFlow.get(r.convoId) ? " ✓" : ` ✗ (true ${trueFlow.get(r.convoId)})`}` : "-";
    console.log(
      [
        `convo ${r.convoId.padEnd(6)}`,
        r.status.padEnd(7),
        `${(r.latencyMs / 1000).toFixed(1).padStart(5)}s`,
        `${String(r.usage.totalTokens).padStart(5)} tok`,
        `attempts ${r.attempts}`,
        r.repaired ? "repaired" : "",
        `intent ${intent}`,
        r.output ? `id ${r.output.identity_verification} policy ${r.output.policy_adherence} res ${r.output.resolution} emp ${r.output.empathy}` : "",
        r.error ? `\n    error: ${r.error.slice(0, 300)}` : "",
      ]
        .filter(Boolean)
        .join("  ")
    );
  },
});

function percentile(values: number[], p: number): number {
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const ok = results.filter((r) => r.status === "ok");
const answered = results.filter((r) => r.status !== "error");
const latencies = answered.map((r) => r.latencyMs / 1000);
const tokens = answered.map((r) => r.usage.totalTokens);
const intentCorrect = ok.filter((r) => r.output?.intent === trueFlow.get(r.convoId)).length;

console.log(`
Summary (${model}, rubric ${rubric.version})
  valid       ${ok.length}/${results.length} (${((100 * ok.length) / results.length).toFixed(0)}%), repaired ${results.filter((r) => r.repaired).length}, invalid ${results.filter((r) => r.status === "invalid").length}, error ${results.filter((r) => r.status === "error").length}
  latency     p50 ${percentile(latencies, 50).toFixed(1)}s, p95 ${percentile(latencies, 95).toFixed(1)}s
  tokens      ${tokens.length ? Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length) : 0} per convo on average
  attempts    ${results.reduce((a, r) => a + r.attempts, 0)} HTTP requests
  intent      ${intentCorrect}/${ok.length} match the true flow
  wall clock  ${((Date.now() - started) / 1000).toFixed(1)}s`);
