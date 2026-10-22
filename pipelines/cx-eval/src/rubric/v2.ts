import type { RubricVersion } from "../contract.ts";
import { renderContext, renderRubricPrompt, renderTranscript, RUBRIC_V1, type Dimension, type Rubric } from "./v1.ts";

// v2: same rules as v1, applied as a procedure.
//
// v1's judge read the identity rule by its spirit ("was the customer verified
// before anything changed?") and passed chats that break its letter: the
// wrong gate button, a missing pull-up-account, or a read-only policy step
// before verification. On days 1–7 it caught almost none of the ground-truth
// identity failures. v2 keeps every rule and makes the judge show its work:
// it must locate each required button and write the positions into evidence
// before giving a verdict. Everything else is unchanged, so a before/after on
// the same chats isolates this change.

const IDENTITY_PROCEDURE = [
  "Procedure, follow exactly: (1) REQUIRED = the policy steps up to and including the first verify-identity or validate-purchase.",
  "(2) Number the ACTION lines 1, 2, 3… and find the first ACTION with exactly each REQUIRED button id; a different gate button does not count.",
  "(3) LATER = the first ACTION whose button is a policy step listed after the gate (even a read-only one such as shipping-status).",
  "(4) pass only if every REQUIRED button was found and all come before LATER (or there is no LATER); otherwise fail.",
  "Evidence must show the positions, e.g. \"pull-up-account@1 verify-identity@2; later update-account@4 → pass\" or \"validate-purchase missing → fail\".",
];

const POLICY_PROCEDURE = [
  "Procedure for action intents: list the ACTION buttons in order; name any button that is not a policy step, search-faq or select-faq (→ fail); then check that the policy steps used never go back to an earlier step (→ fail).",
  "Evidence must name the offending button or say \"all buttons allowed, in order\".",
];

function withRules(d: Dimension, extra: string[]): Dimension {
  return { ...d, rules: [...d.rules, ...extra] };
}

export const RUBRIC_V2: Rubric = {
  ...RUBRIC_V1,
  version: "v2",
  title: `${RUBRIC_V1.title} (v2: procedural identity and policy checks)`,
  dimensions: RUBRIC_V1.dimensions.map((d) =>
    d.id === "identity_verification" ? withRules(d, IDENTITY_PROCEDURE)
    : d.id === "policy_adherence" ? withRules(d, POLICY_PROCEDURE)
    : d
  ),
  // Position lists need more room than a short quote.
  promptLimits: { ...RUBRIC_V1.promptLimits, evidenceWords: 40 },
};

export const rubricV2: RubricVersion = {
  version: RUBRIC_V2.version,
  buildPrompt(context) {
    return {
      system: `${renderRubricPrompt(RUBRIC_V2)}\n\n${renderContext(context, RUBRIC_V2)}`,
      user: renderTranscript(context.turns),
    };
  },
};
