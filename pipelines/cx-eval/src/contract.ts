// Shared contract between the stages of the CX evaluation pipeline:
//   ELT (SQL in Supabase) builds a JudgeContext per conversation,
//   the rubric renders it into a prompt,
//   the judge client returns a JudgeOutput, which is stored in cx_eval.scores.
// Change this file first when a stage's inputs or outputs change.

/** The 10 contact reasons (ABCD "flows"), with descriptions from guidelines.json. */
export const FLOWS = {
  product_defect: "Refunds and returns",
  order_issue: "Get the status of an order or change an order, possibly shipping",
  account_access: "Username, password and two-factor authentication",
  troubleshoot_site: "Website slow, search not working, credit card, cart not updating",
  manage_account: "Subscription service added or removed, change profile info",
  purchase_dispute: "Bad price, out of stock, promo codes, billing",
  shipping_issue: "Check or update a shipment of an item",
  subscription_inquiry: "Billing and updates of the premium subscription service",
  single_item_query: "FAQ questions about jeans, boots, shirts or jackets",
  storewide_query: "FAQ questions about pricing, timing, membership or policies",
} as const;

export type Flow = keyof typeof FLOWS;
export const FLOW_IDS = Object.keys(FLOWS) as Flow[];

/** Agent actions that verify the customer before account or order changes. */
export const IDENTITY_GATE_ACTIONS = ["verify-identity", "validate-purchase"] as const;

/**
 * Everything the judge may see for one conversation. Assembled in SQL
 * (cx_eval.scoring_requests.context) so the prompt inputs are stored and
 * reproducible; the rubric turns it into prompt text.
 *
 * Deliberately excludes ground truth (true flow, compliance flags) and the
 * synthetic CSAT: the judge must infer those, and they are used to measure it.
 */
export interface JudgeContext {
  convoId: string;
  /**
   * Contact reason the agent logged (subflow label, e.g. "refund_status"). Synthetic
   * disposition: it matches the true intent ~92% of the time, like real tags. Policy
   * steps and guideline follow this logged reason, so a wrong tag means wrong policy
   * context. The judge must read the transcript, not trust the tag.
   */
  contactReason: string;
  /** Policy steps that may be needed for this contact reason, in order; empty for FAQ intents. */
  policySteps: string[];
  /** Natural-language agent guideline for this contact reason, from guidelines.json (may be empty). */
  guideline: string;
  /**
   * "agent" | "customer" | "action" turns in order. Action turns are buttons the
   * agent clicked; `button` is the logged button id (e.g. "verify-identity").
   */
  turns: { speaker: "agent" | "customer" | "action"; text: string; button?: string }[];
}

export type PassFail = "pass" | "fail";
export type PassFailNa = PassFail | "na";
export type Resolution = "resolved" | "partial" | "unresolved";

/** What the judge returns for one conversation. One row per dimension in cx_eval.scores. */
export interface JudgeOutput {
  intent: Flow;
  identity_verification: PassFailNa;
  policy_adherence: PassFail;
  resolution: Resolution;
  /** 1–5 */
  empathy: number;
  /** Short quotes or reasons, at most ~25 words each. */
  evidence: {
    intent: string;
    identity_verification: string;
    policy_adherence: string;
    resolution: string;
    empathy: string;
  };
}

export const LLM_DIMENSIONS = ["intent", "identity_verification", "policy_adherence", "resolution", "empathy"] as const;
export type LlmDimension = (typeof LLM_DIMENSIONS)[number];

/** A versioned rubric: renders the judge prompt and the human-readable RUBRIC.md from one source. */
export interface RubricVersion {
  version: string; // e.g. "v1"
  buildPrompt(context: JudgeContext): { system: string; user: string };
}
