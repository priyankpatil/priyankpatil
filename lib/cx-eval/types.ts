// Shapes of the static data behind /projects/cx-eval. Both JSON files are
// written by pipelines/cx-eval/scripts/export-demo.mts from the warehouse and
// committed, so the page never needs the database at request time.

import type { JudgeOutput } from "@/pipelines/cx-eval/src/contract.ts";

export type RubricId = "v1" | "v2";

/** One record exactly as the simulated support system delivers it. */
export interface RawTurn {
  speaker: string;
  text: string;
  button?: string;
}

export interface RawRecord {
  conversation_id: string;
  started_at: string;
  channel: string;
  agent_id: string;
  logged_reason: string;
  customer: { member_level: string | null };
  transcript?: RawTurn[];
  messages?: RawTurn[];
  [key: string]: unknown;
}

/** A stored judge outcome (latest successful result for one model × rubric). */
export interface StoredRun {
  model: string;
  rubric: RubricId;
  /** production = the model and rubric live for that day; backtest = re-scored later on the same input. */
  role: "production" | "backtest";
  output: JudgeOutput;
  rawContent: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  repaired: boolean;
  attempts: number;
  promptHash: string;
  judgedAt: string;
  resultId: number;
  /** The rows as they sit in cx_eval.scores (long format). */
  scoreRows: { scoreId: number; dimension: string; value: string; valueNum: number | null }[];
}

/** A judge run on the same chat with a different contact reason (precomputed, not stored in the warehouse). */
export interface AltRun {
  model: string;
  rubric: RubricId;
  status: "ok" | "invalid" | "error";
  output?: JudgeOutput;
  rawContent: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  repaired: boolean;
  judgedAt: string;
}

export interface DemoChat {
  id: string;
  label: string;
  /** One line: what this chat shows. */
  blurb: string;
  batchDate: string;
  raw: RawRecord;
  /** JudgeContext minus turns (turns = raw.transcript), as stored in cx_eval.scoring_requests. */
  context: { contactReason: string; policySteps: string[]; guideline: string; estTokens: number };
  enrich: {
    teamId: string;
    nTurns: number;
    nAgentTurns: number;
    nCustomerTurns: number;
    nActions: number;
    nWords: number;
    actions: string[];
    trueFlow: string;
    trueSubflow: string;
    reasonTagCorrect: boolean;
    /** Policy for the TRUE intent; ground truth is computed against it. */
    truePolicySteps: string[];
    isFaq: boolean;
    gtIdentity: "pass" | "fail" | "na";
    gtPolicy: "pass" | "fail";
    gtOnPolicy: boolean;
    gtInOrder: boolean;
    gtFaqSearched: boolean;
    medianTurns: number;
    efficiency: number;
    csat: number | null;
  };
  runs: StoredRun[];
  /** "Mislabel the contact reason" (or, for a chat that is already mislabelled, correct it). */
  alt: {
    kind: "mislabel" | "correct";
    contactReason: string;
    policySteps: string[];
    guideline: string;
    runs: AltRun[];
  };
}

export interface DemoData {
  generatedAt: string;
  /** Every contact reason the warehouse knows (cx_eval.ref_subflows), for the validation mirror. */
  knownReasons: string[];
  chats: DemoChat[];
}

export interface Findings {
  generatedAt: string;
  hero: {
    conversations: number;
    days: number;
    scoredProduction: number;
    checkableVerdicts: number;
    checkableAgreementPct: number;
  };
  team: {
    routingDate: string;
    series: { date: string; t4: number | null; others: number | null; company: number | null }[];
    before: { t4: number; others: number; company: number };
    after: { t4: number; others: number; company: number };
    csat: { t4Before: number; t4After: number; othersBefore: number; othersAfter: number };
  };
  model: {
    switchDate: string;
    fromModel: string;
    toModel: string;
    series: { date: string; cxi: number | null; csat: number | null }[];
    before: { cxi: number; csat: number; empathy: number; resolvedPct: number };
    after: { cxi: number; csat: number; empathy: number; resolvedPct: number };
    /** Both models on the same chats (backtest). null until the backtest has scored anything. */
    backtest: {
      from: string;
      to: string;
      n: number;
      planned: number;
      primary: { cxi: number; empathy: number; resolvedPct: number };
      secondary: { cxi: number; empathy: number; resolvedPct: number };
    } | null;
  };
  quarantine: {
    date: string;
    series: { date: string; loaded: number; quarantined: number }[];
    loaded: number;
    quarantined: number;
    lastValidAt: string | null;
    firstQuarantinedAt: string | null;
    csatResponses: number;
    typicalCsatResponses: number;
  };
  trust: {
    production: { model: string; rubric: string; n: number; intentPct: number; identityPct: number; policyPct: number }[];
    rubricBacktest: {
      from: string;
      to: string;
      model: string;
      planned: number;
      n: number;
      trueFails: number;
      v1Recall: number | null;
      v2Recall: number | null;
      v1IdentityPct: number | null;
      v2IdentityPct: number | null;
    } | null;
  };
}

/** NDJSON events from app/api/cx-eval/judge (one per line). */
export type LiveEvent =
  | { type: "prompt"; promptHash: string; estTokens: number; contactReason: string }
  | { type: "judge_start"; model: string }
  | {
      type: "result";
      status: "ok" | "invalid" | "error";
      output?: JudgeOutput;
      rawContent: string;
      error?: string;
      model: string;
      latencyMs: number;
      promptTokens: number;
      completionTokens: number;
      repaired: boolean;
      attempts: number;
    }
  | { type: "fallback"; reason: string }
  | { type: "done" };
