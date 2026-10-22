// Rubric v1: the single source for the judge prompt (buildPrompt), RUBRIC.md
// (scripts/render-rubric.mts) and the CXI formula (cxiScore). Edit here, then
// re-render RUBRIC.md; never edit the rendered text by hand.
//
// Decision rules for identity and policy mirror the ground-truth checks computed
// in code, so judge accuracy against them measures the judge, not the rubric.

import {
  FLOWS,
  FLOW_IDS,
  IDENTITY_GATE_ACTIONS,
  type Flow,
  type JudgeContext,
  type JudgeOutput,
  type LlmDimension,
  type RubricVersion,
} from "../contract.ts";

export interface Anchor {
  convoId: string;
  split: "train" | "dev" | "test";
  label: string;
  /** A few transcript lines, not the whole chat. Humans only; never sent to the judge. */
  excerpt: string[];
  why: string;
}

export interface Dimension {
  id: LlmDimension | "efficiency";
  name: string;
  question: string;
  scoredBy: "llm" | "code";
  /** Allowed values, in the order the JSON shape shows them. */
  values: readonly (string | number)[];
  definition: string;
  /** Meaning of each value, when the value name alone is not enough. */
  levels?: { value: string | number; meaning: string }[];
  /** Ordered decision rules; for LLM dimensions these go into the prompt verbatim. */
  rules: string[];
  na: string[];
  /** For human scorers; kept out of the prompt for token budget. The rules cover the important ones. */
  pitfalls: string[];
  anchors: Anchor[];
}

/**
 * Routing cues appended to the FLOWS descriptions, only where the description
 * leaves overlaps open. Intent accuracy was 4–6/12 with bare flow ids.
 */
const FLOW_CUES: Partial<Record<Flow, string>> = {
  product_defect: "return (size, colour, stain); start, update or check a refund",
  order_issue: "cancel, upgrade or create an order; delivery date; wrong quantity; order payment method; unknown fee",
  manage_account: "name, address, phone or payment method on the profile; missing credit",
  purchase_dispute: "price rose or is lower elsewhere; billed for an item never bought or already returned",
  shipping_issue: "where a shipment is; change its address or method; shipping cost; item missing from a delivery",
  subscription_inquiry: "premium amount or date due, pay the bill, extension, disputed subscription charge",
  single_item_query: "e.g. washing, fit, materials",
};

export interface Rubric {
  version: string;
  title: string;
  /** General rules: shown to the judge first and to humans under "How to use it". */
  general: string[];
  flowCues: Partial<Record<Flow, string>>;
  dimensions: Dimension[];
  /** CXI weights (sum 1). na dimensions are excluded and the rest renormalised. */
  cxiWeights: Record<"policy_adherence" | "identity_verification" | "resolution" | "empathy" | "efficiency", number>;
  promptLimits: { guidelineChars: number; evidenceWords: number };
}

const GATES = IDENTITY_GATE_ACTIONS.join(" or ");

export const RUBRIC_V1: Rubric = {
  version: "v1",
  title: "CX conversation rubric",
  general: [
    "Score one customer-support chat for an online clothing store.",
    "Lines are AGENT, CUSTOMER or ACTION. An ACTION is a button the agent clicked: [button-id] then the system message. Judge what the agent did from ACTION lines only, not from what it says.",
    "The logged contact reason is the agent's tag and is wrong ~8% of the time. Decide intent from the transcript. If the tag clearly mismatches the need, ignore its policy steps and judge identity and policy by the real need (account or order changes: pull-up-account then verification first; FAQ: an FAQ search, no verification).",
    "Policy steps MAY be needed, in order; chats branch (e.g. troubleshooting stops once fixed), so skipped steps are fine unless a rule says otherwise.",
  ],
  flowCues: FLOW_CUES,
  dimensions: [
    {
      id: "intent",
      name: "Intent identified",
      question: "Which flow matches what the customer actually needed?",
      scoredBy: "llm",
      values: FLOW_IDS,
      definition: "The contact reason, as one of the 10 ABCD flows, inferred from the conversation.",
      rules: [
        "Use the customer's main request (usually the opening one), not the tag.",
        "FAQ flows are for general questions needing no account lookup; anything about the customer's own account, order or bill is not FAQ.",
      ],
      na: ["Never na: always pick one flow."],
      pitfalls: [
        "Copying the logged tag. It is synthetic noise ~8% of the time; the transcript wins.",
        "Premium subscription billing is subscription_inquiry, not purchase_dispute or manage_account.",
        "Order delivery date or time is order_issue; where a shipment is, or a missing item, is shipping_issue.",
        "A customer who mentions an item while asking about their own order is not an FAQ intent.",
      ],
      anchors: [],
    },
    {
      id: "identity_verification",
      name: "Identity verification",
      question: "Was the customer verified before account or order changes?",
      scoredBy: "llm",
      values: ["pass", "fail", "na"],
      definition: `For intents whose policy includes a gate step (${GATES}), the agent must complete every policy step up to and including the gate before any later policy step (account or order change, refund, promo code, etc.).`,
      rules: [
        `pass: every policy step up to and including the gate (${GATES}) ran before any later policy step.`,
        "fail: the gate never ran (even if nothing changed after), a later step came first, or a step listed before the gate is missing.",
        "Only the listed gate counts (verify-identity and validate-purchase are not interchangeable); asking for details is not an ACTION.",
      ],
      na: ["na: FAQ intent, or no gate in the policy steps."],
      pitfalls: [
        "Passing because the agent asked for name, email and order ID. Without the gate ACTION it is a fail.",
        "Passing a chat that ended early: if the policy has a gate and it never ran, it is a fail.",
        "Scoring na for a gated intent because no change was made. na depends only on the policy.",
        "Repeating the gate later (e.g. for a second request) does not change a pass.",
      ],
      anchors: [
        {
          convoId: "7399",
          split: "dev",
          label: "pass",
          excerpt: [
            "CUSTOMER: I need to pay my premium subscription fee.",
            "ACTION: Account has been pulled up for Crystal Minh.",
            "ACTION: Identity verification in progress ...",
            "ACTION: Querying the system for subscription status ...",
            "ACTION: Account has been updated with renew subscription.",
          ],
          why: "manage_pay_bill policy: pull-up-account → verify-identity → … → update-account. pull-up-account and verify-identity both ran before the account update.",
        },
        {
          convoId: "5183",
          split: "dev",
          label: "fail",
          excerpt: [
            "CUSTOMER: It seems the price has grossly inflated overnight",
            "ACTION: Account has been pulled up for Sanya Afzal.",
            "ACTION: A reason of yesterday has been recorded.",
            "AGENT: I am going to give you a promo code so you can purchase for a similar price",
            "ACTION: A promo code has been created.",
          ],
          why: "bad_price_yesterday policy puts verify-identity before promo-code. The promo code was issued without verification.",
        },
        {
          convoId: "8641",
          split: "dev",
          label: "fail",
          excerpt: [
            "CUSTOMER: I need you to check on my refund.",
            "ACTION: Account has been pulled up for Rodriguez Domingo.",
            "ACTION: Identity verification in progress ...",
            "AGENT: I am showing that the refund in is progress",
          ],
          why: "refund_status requires validate-purchase; the agent ran verify-identity instead. The gates are not interchangeable.",
        },
        {
          convoId: "2678",
          split: "dev",
          label: "na",
          excerpt: [
            "CUSTOMER: can you please tell me what the washing requirements are for a Michael Kors jacket",
            "ACTION: Searching the FAQ pages ...",
            "ACTION: System Action: search jacket",
            "AGENT: So you can wash your jacket in a typical washer and dryer",
          ],
          why: "FAQ intent (single_item_query): no account access needed, so no gate.",
        },
      ],
    },
    {
      id: "policy_adherence",
      name: "Policy adherence",
      question: "Only allowed actions, in policy order?",
      scoredBy: "llm",
      values: ["pass", "fail"],
      definition: "Action intents: every button is a policy step for the intent (search-faq and select-faq always allowed) and policy steps are used in policy order. FAQ intents: the agent searched the FAQ.",
      rules: [
        "Action intents: fail if any ACTION is not a listed policy step, search-faq or select-faq (e.g. update-order when update-account is listed).",
        "Fail if policy steps go out of order (repeating a step right away is fine).",
        "Skipped steps, including a skipped gate (scored under identity), do not fail policy.",
        "FAQ intents: pass if any search ACTION ran (search-faq, select-faq, search-<topic>), else fail.",
      ],
      na: ["Never na: every chat has a policy (FAQ intents: search the FAQ)."],
      pitfalls: [
        "Failing a chat for skipping steps that its branch did not need (e.g. no refund because the item was ineligible).",
        "Failing policy for a skipped verification: that is identity's job; do not double-count.",
        "Allowing topic searches (search-jeans etc.) in an action intent: only search-faq / select-faq are always allowed.",
        "Judging by what the agent said it would do rather than the ACTION lines.",
        "Re-running an earlier step (e.g. verify-identity again for a second request) after a later one is out of order, so a fail.",
      ],
      anchors: [
        {
          convoId: "10044",
          split: "dev",
          label: "pass",
          excerpt: [
            "CUSTOMER: This Calvin Klein jacket is WAY overpriced at $74.",
            "CUSTOMER: Your competition is selling it at only $50!",
            "ACTION: Account has been pulled up for Joseph Banter.",
            "ACTION: A reason of competitor has been recorded.",
            "ACTION: Identity verification in progress ...",
            "ACTION: A promo code has been created.",
          ],
          why: "bad_price_competitor policy: pull-up-account → record-reason → verify-identity → promo-code. All four, in order, nothing else.",
        },
        {
          convoId: "7177",
          split: "dev",
          label: "fail",
          excerpt: [
            "CUSTOMER: a subscription was added to our account but we didn't ask for it.",
            "ACTION: Querying the system for an answer ...",
            "ACTION: Order has been updated with remove service.",
            "ACTION: A refund has been made for the amount of $40.",
          ],
          why: "status_service_added allows update-account, not update-order. One off-policy button is a fail.",
        },
        {
          convoId: "7302",
          split: "dev",
          label: "fail",
          excerpt: [
            "ACTION: Querying the system for subscription status ...",
            "ACTION: Details of 14 have been entered.",
            "AGENT: I will also send you a link so you can log in and check the status",
            "ACTION: A link will be sent.",
          ],
          why: "status_due_amount policy order is … subscription-status → send-link → enter-details. enter-details came before send-link.",
        },
        {
          convoId: "2678",
          split: "dev",
          label: "pass",
          excerpt: ["ACTION: Searching the FAQ pages ...", "ACTION: System Action: search jacket"],
          why: "FAQ intent and the agent searched the FAQ before answering.",
        },
      ],
    },
    {
      id: "resolution",
      name: "Resolution",
      question: "Outcome of the main request at the end of the chat?",
      scoredBy: "llm",
      values: ["resolved", "partial", "unresolved"],
      definition: "Outcome of the customer's main request at the end of the chat, regardless of how it was handled.",
      levels: [
        { value: "resolved", meaning: "completed or fully answered, including a policy-based no with the reason explained" },
        { value: "partial", meaning: "progress, but escalated, handed off, follow-up or call-back needed, or only some requests done" },
        { value: "unresolved", meaning: "nothing moved it forward, a wrong answer, or the chat ended first (customer left)" },
      ],
      rules: ["Judge the main request; the customer's thanks or displeasure does not change the level."],
      na: ["Never na."],
      pitfalls: [
        "Scoring unresolved because the answer was no. If the no is policy and explained, it is resolved.",
        "Scoring resolved because the customer said thanks. Politeness is not completion.",
        "\"A manager will contact you\", \"call back for a label\", \"we will get back to you\": partial, not resolved.",
        "Letting compliance leak in: a resolved chat can still fail identity or policy.",
      ],
      anchors: [
        {
          convoId: "7399",
          split: "dev",
          label: "resolved",
          excerpt: ["ACTION: Account has been updated with renew subscription.", "AGENT: You pay has been paid, is there anything else I can help with today?"],
          why: "The bill was paid in the chat.",
        },
        {
          convoId: "1938",
          split: "dev",
          label: "resolved",
          excerpt: [
            "AGENT: Unfortunately because it is past 30 days and there is no receipt we cannot accept the return. I do sincerely apologize.",
            "CUSTOMER: Is there no way at all, a credit maybe instead of a refund?",
            "AGENT: No I afraid not, I do apologize.",
          ],
          why: "A policy-based no, with the reason. The customer knows the outcome.",
        },
        {
          convoId: "2758",
          split: "dev",
          label: "partial",
          excerpt: ["CUSTOMER: Can you just cancel one?", "AGENT: No we cannot at this moment.", "AGENT: Im escalating to management right now.", "AGENT: I will have a manager reach out to you."],
          why: "The duplicate order was found but not fixed; handed to a manager for follow-up.",
        },
        {
          convoId: "4688",
          split: "dev",
          label: "unresolved",
          excerpt: [
            "CUSTOMER: one product is order but no delyvey .. why?",
            "AGENT: Okay I have your account pulled up. I need your username, email address and order ID.",
            "AGENT: I'm sorry but I will have to end this conversation for non-responiveness.",
          ],
          why: "The missing item was never looked into. (Identity is also a fail: the gate never ran.)",
        },
      ],
    },
    {
      id: "empathy",
      name: "Empathy and professionalism",
      question: "Agent's warmth and professionalism?",
      scoredBy: "llm",
      values: [1, 2, 3, 4, 5],
      definition: "The agent's tone and manner across the chat, independent of outcome and compliance.",
      levels: [
        { value: 1, meaning: "dismissive or rude; ignores the customer" },
        { value: 2, meaning: "mechanical, terse, no acknowledgement" },
        { value: 3, meaning: "polite but neutral" },
        { value: 4, meaning: "warm, acknowledges the problem" },
        { value: 5, meaning: "warm and personal, apologises where due, patient with frustration" },
      ],
      rules: ["Tone only, not outcome or policy. Start at 3 and adjust; typos do not count."],
      na: ["Never na."],
      pitfalls: [
        "Lowering empathy because the agent had to say no.",
        "Raising empathy for scripted closings alone (\"have a great day\").",
      ],
      anchors: [
        {
          convoId: "1396",
          split: "dev",
          label: "1",
          excerpt: [
            "CUSTOMER: r u there",
            "CUSTOMER: hello",
            "AGENT: Is that your order id?",
            "CUSTOMER: what am I waiting on now",
            "AGENT: nothing",
          ],
          why: "Ignores the customer's worry, no acknowledgement or apology, and a brush-off final reply.",
        },
        {
          convoId: "10044",
          split: "dev",
          label: "5",
          excerpt: [
            "AGENT: I know it's frustrating; however, sometimes prices do change based on availability.",
            "CUSTOMER: Well that's really unacceptable.",
            "AGENT: I understand, and I apologize.",
            "AGENT: Joseph, may I offer you a complimentary promo code?",
          ],
          why: "Names the feeling, apologises, uses the customer's name and stays patient with an upset customer.",
        },
      ],
    },
    {
      id: "efficiency",
      name: "Efficiency",
      question: "How long was the chat compared with typical chats for the same intent?",
      scoredBy: "code",
      values: [1, 2, 3, 4, 5],
      definition: "Turn count (all speakers, including actions) against the median turn count for the conversation's intent. Computed in code, not by the LLM.",
      levels: [
        { value: 5, meaning: "turns ≤ median" },
        { value: 4, meaning: "≤ 1.25 × median" },
        { value: 3, meaning: "≤ 1.5 × median" },
        { value: 2, meaning: "≤ 2 × median" },
        { value: 1, meaning: "> 2 × median" },
      ],
      rules: ["Deterministic: see efficiencyScore(). Human scorers record it but do not judge it."],
      na: ["Never na."],
      pitfalls: ["Long is not always bad (a frustrated customer, several requests); that is why it carries only 10% of CXI."],
      anchors: [],
    },
  ],
  cxiWeights: { policy_adherence: 0.3, identity_verification: 0.2, resolution: 0.25, empathy: 0.15, efficiency: 0.1 },
  promptLimits: { guidelineChars: 1500, evidenceWords: 25 },
};

const llmDimensions = () => RUBRIC_V1.dimensions.filter((d) => d.scoredBy === "llm");

/** 1–5 from turn count vs the median for the intent. */
export function efficiencyScore(turns: number, medianTurns: number): number {
  const ratio = turns / medianTurns;
  if (ratio <= 1) return 5;
  if (ratio <= 1.25) return 4;
  if (ratio <= 1.5) return 3;
  if (ratio <= 2) return 2;
  return 1;
}

const RESOLUTION_POINTS = { resolved: 100, partial: 50, unresolved: 0 } as const;
const scaleToPoints = (s: number) => {
  if (!Number.isInteger(s) || s < 1 || s > 5) throw new RangeError(`expected an integer 1–5, got ${s}`);
  return ((s - 1) / 4) * 100;
};

/**
 * CXI 0–100. pass=100, fail=0, na excluded with the remaining weights renormalised;
 * resolved=100, partial=50, unresolved=0; 1–5 scales map to (s−1)/4×100.
 * Unrounded, so SQL can be checked against it exactly.
 */
export function cxiScore(output: Pick<JudgeOutput, "identity_verification" | "policy_adherence" | "resolution" | "empathy">, efficiency: number): number {
  const w = RUBRIC_V1.cxiWeights;
  const parts: [number, number][] = [
    [w.policy_adherence, output.policy_adherence === "pass" ? 100 : 0],
    [w.resolution, RESOLUTION_POINTS[output.resolution]],
    [w.empathy, scaleToPoints(output.empathy)],
    [w.efficiency, scaleToPoints(efficiency)],
  ];
  if (output.identity_verification !== "na") parts.push([w.identity_verification, output.identity_verification === "pass" ? 100 : 0]);
  const weight = parts.reduce((s, [wt]) => s + wt, 0);
  return parts.reduce((s, [wt, pts]) => s + wt * pts, 0) / weight;
}

// Action turns arrive as the system message only ("Identity verification in
// progress ..."). Policy steps are button ids, so tag each action with its id
// to let the judge compare them. Troubleshooting buttons share one message.
const ACTION_PATTERNS: [RegExp, string][] = [
  [/^Account has been pulled up/i, "pull-up-account"],
  [/^Purchase validation/i, "validate-purchase"],
  [/^Identity verification/i, "verify-identity"],
  [/^Details of .* entered/i, "enter-details"],
  [/^The .* (has|have) been notified/i, "notify-team"],
  [/^Searching the FAQ/i, "search-faq"],
  [/^FAQ answer related/i, "select-faq"],
  [/^System Action: search (\w+)/i, "search-$1"],
  [/^Shipping status of/i, "shipping-status"],
  [/^Order has been updated/i, "update-order"],
  [/^Account has been updated/i, "update-account"],
  [/^Membership level of/i, "membership"],
  [/^A refund has been made/i, "offer-refund"],
  [/^Querying the system for subscription status/i, "subscription-status"],
  [/^Querying the system for an answer/i, "ask-the-oracle"],
  [/^A reason of/i, "record-reason"],
  [/^A link will be sent/i, "send-link"],
  [/^A password has been generated/i, "make-password"],
  [/^A promo code has been created/i, "promo-code"],
  [/^A purchase of/i, "make-purchase"],
  [/^Agent is looking for solutions/i, "troubleshooting: log-out-in, try-again or instructions"],
];

export function actionButton(text: string): string | null {
  for (const [re, id] of ACTION_PATTERNS) {
    const m = text.match(re);
    if (m) return id.replace("$1", (m[1] ?? "").toLowerCase());
  }
  return null;
}

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return `${cut.slice(0, end > max * 0.8 ? end + 1 : max).trim()} …`;
}

const choices = (values: readonly (string | number)[]) => values.map((v) => (typeof v === "string" ? `"${v}"` : v)).join("|");

function jsonShape(): string {
  const dims = llmDimensions();
  const fields = dims.map((d) => `"${d.id}":${d.id === "intent" ? '"<flow id>"' : choices(d.values)}`);
  const evidence = dims.map((d) => `"${d.id}":"..."`);
  return `{${fields.join(",")},"evidence":{${evidence.join(",")}}}`;
}

/** The static part of the system prompt: identical for every conversation. */
export function renderRubricPrompt(r: Rubric = RUBRIC_V1): string {
  const lines = [...r.general, "", "Flows (intent ids):"];
  for (const id of FLOW_IDS) lines.push(`- ${id}: ${FLOWS[id]}${r.flowCues[id] ? `; ${r.flowCues[id]}` : ""}`);
  lines.push("", "Dimensions (check na first, then rules in order):");
  for (const d of r.dimensions) {
    if (d.scoredBy !== "llm") continue;
    lines.push(`${d.id}: ${d.question}`);
    for (const l of d.levels ?? []) lines.push(`  ${l.value} = ${l.meaning}`);
    // "Never na" notes are for humans; the JSON shape already says which fields allow na.
    for (const rule of [...d.na.filter((n) => !n.startsWith("Never")), ...d.rules]) lines.push(`  - ${rule}`);
  }
  lines.push(
    "",
    `Reply with ONLY this JSON, no prose or code fence. Evidence: a quote or reason, max ${r.promptLimits.evidenceWords} words each.`,
    jsonShape(),
  );
  return lines.join("\n");
}

export function renderContext(c: JudgeContext, r: Rubric): string {
  const steps = c.policySteps.length
    ? c.policySteps.join(" → ")
    : "none (FAQ intent: search the FAQ; no account access, identity na)";
  const lines = [
    "This chat:",
    `- Logged contact reason (may be wrong): ${c.contactReason}`,
    `- Policy steps for it, in order: ${steps}`,
  ];
  if (c.guideline.trim()) lines.push(`- Guideline: ${truncate(c.guideline, r.promptLimits.guidelineChars)}`);
  return lines.join("\n");
}

export function renderTranscript(turns: JudgeContext["turns"]): string {
  return turns
    .map(({ speaker, text, button }) => {
      const t = text.replace(/\s+/g, " ").trim();
      if (speaker !== "action") return `${speaker.toUpperCase()}: ${t}`;
      // Prefer the logged button id; infer it from the system message only when missing.
      const id = button ?? (t.startsWith("[") ? null : actionButton(t));
      return `ACTION: ${id ? `[${id}] ` : ""}${t}`;
    })
    .join("\n");
}

export const rubricV1: RubricVersion = {
  version: RUBRIC_V1.version,
  buildPrompt(context) {
    // Static rubric first, per-chat context last, so providers can cache the prefix.
    return {
      system: `${renderRubricPrompt()}\n\n${renderContext(context, RUBRIC_V1)}`,
      user: renderTranscript(context.turns),
    };
  },
};
