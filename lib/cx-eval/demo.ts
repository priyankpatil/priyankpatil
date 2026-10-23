// Client-safe helpers shared by the demo component and the live judge route.
// Prompts are built with the pipeline's own rubric code, never re-typed.

import { NVIDIA_MODELS } from "@/pipelines/cx-eval/src/judge/nvidia.ts";
import type { JudgeContext, JudgeOutput } from "@/pipelines/cx-eval/src/contract.ts";
import { cxiScore, RUBRIC_V1, rubricV1 } from "@/pipelines/cx-eval/src/rubric/v1.ts";
import { rubricV2 } from "@/pipelines/cx-eval/src/rubric/v2.ts";
import demoJson from "./demo.json";
import type { DemoChat, DemoData, RubricId } from "./types";

export const demo = demoJson as unknown as DemoData;

export const MODELS = [
  { id: NVIDIA_MODELS.primary, short: "gpt-oss-20b", note: "The original judge, in use Sep 23 – Oct 9." },
  { id: NVIDIA_MODELS.secondary, short: "nemotron-3-ultra", note: "The replacement, in use from Oct 10." },
] as const;
export type ModelId = (typeof MODELS)[number]["id"];

export const RUBRICS = { v1: rubricV1, v2: rubricV2 } as const;

export const shortModel = (id: string) => MODELS.find((m) => m.id === id)?.short ?? id.split("/").pop() ?? id;

/** Plain-language one-liners for the picker (the exported blurbs predate the page rewrite). */
const BLURBS: Record<string, string> = {
  "abcd-1501": "Every required step, in the right order. The judge and the facts agree on everything.",
  "abcd-9039": "Username recovery needs an identity check; the agent ran a purchase check instead. The judge catches it.",
  "abcd-9434": "A return where the agent changes the order before taking the customer's address. The judge catches it.",
  "abcd-8971": "Logged as a refund, really a return. The wrong label pulls the wrong rules into the prompt.",
  "abcd-8256": "A washing question answered from the FAQ. No account access, so no identity check is needed.",
  "abcd-2642": "A slow website. The judge's first answer was badly formatted and was sent back once to fix.",
  "abcd-7598": "55 messages over a disputed bill, no refund, and the customer rated it 1 out of 5.",
  "abcd-726": "The agent ran the wrong identity check and the judge missed it. The stricter rubric in stage 8 catches it.",
};
export const blurbOf = (chat: DemoChat) => BLURBS[chat.id] ?? chat.blurb;

export function findChat(id: string): DemoChat | undefined {
  return demo.chats.find((c) => c.id === id);
}

/** The JudgeContext the pipeline stored (or the alt-reason variant). Turns come from the raw record. */
export function buildContext(chat: DemoChat, useAlt: boolean): JudgeContext {
  const src = useAlt ? chat.alt : chat.context;
  return {
    convoId: chat.id,
    contactReason: src.contactReason,
    policySteps: src.policySteps,
    guideline: src.guideline,
    turns: (chat.raw.transcript ?? []).map((t) => ({
      speaker: t.speaker as JudgeContext["turns"][number]["speaker"],
      text: t.text,
      ...(t.button ? { button: t.button } : {}),
    })),
  };
}

export function buildPrompt(chat: DemoChat, rubric: RubricId, useAlt: boolean) {
  return RUBRICS[rubric].buildPrompt(buildContext(chat, useAlt));
}

/** Same rough budget as cx_eval.assemble_scoring_requests: ~4 characters per token. */
export const estimateTokens = (text: string) => Math.round(text.length / 4);

export interface CxiPart {
  dimension: string;
  label: string;
  value: string;
  points: number;
  weight: number;
  /** Weight after renormalising for an na identity verdict. */
  effectiveWeight: number;
}

/** CXI with every term visible. Uses the rubric's own cxiScore for the total. */
export function cxiBreakdown(output: JudgeOutput, efficiency: number): { parts: CxiPart[]; total: number; identityNa: boolean } {
  const w = RUBRIC_V1.cxiWeights;
  const identityNa = output.identity_verification === "na";
  const scale = (s: number) => ((s - 1) / 4) * 100;
  const rows: Omit<CxiPart, "effectiveWeight">[] = [
    { dimension: "policy_adherence", label: "Policy", value: output.policy_adherence, points: output.policy_adherence === "pass" ? 100 : 0, weight: w.policy_adherence },
    {
      dimension: "identity_verification",
      label: "Identity",
      value: output.identity_verification,
      points: output.identity_verification === "pass" ? 100 : 0,
      weight: w.identity_verification,
    },
    {
      dimension: "resolution",
      label: "Resolution",
      value: output.resolution,
      points: { resolved: 100, partial: 50, unresolved: 0 }[output.resolution],
      weight: w.resolution,
    },
    { dimension: "empathy", label: "Empathy", value: `${output.empathy}/5`, points: scale(output.empathy), weight: w.empathy },
    { dimension: "efficiency", label: "Efficiency", value: `${efficiency}/5`, points: scale(efficiency), weight: w.efficiency },
  ];
  const denom = identityNa ? 1 - w.identity_verification : 1;
  const parts = rows.map((r) => ({
    ...r,
    effectiveWeight: r.dimension === "identity_verification" && identityNa ? 0 : r.weight / denom,
  }));
  return { parts, total: cxiScore(output, efficiency), identityNa };
}
