// Plain-language explanations of the ground-truth flags computed in SQL by
// cx_eval.gt_identity / gt_on_policy / gt_in_order (supabase/migrations/
// 20261022000000_cx_eval.sql). The flags themselves come from the warehouse;
// this only says why, for the demo.

const GATES = ["verify-identity", "validate-purchase"];

export function explainIdentity(actions: string[], steps: string[]): string {
  const gate = steps.findIndex((s) => GATES.includes(s));
  if (gate === -1) return "No identity gate in this intent's policy, so not applicable.";
  const required = steps.slice(0, gate + 1);
  const missing = required.filter((s) => !actions.includes(s));
  if (missing.length) return `Required before any change: ${required.join(" → ")}. Never ran: ${missing.join(", ")}.`;
  const lastRequired = Math.max(...required.map((s) => actions.indexOf(s)));
  const later = steps.slice(gate + 1);
  const firstLater = actions.findIndex((a) => later.includes(a));
  if (firstLater !== -1 && firstLater < lastRequired) {
    return `${actions[firstLater]} ran before ${required.join(" → ")} had finished.`;
  }
  return `${required.join(" → ")} all ran before any later policy step.`;
}

export function explainPolicy(actions: string[], steps: string[], isFaq: boolean): string {
  if (isFaq || steps.length === 0) {
    return actions.some((a) => a === "select-faq" || a.startsWith("search-"))
      ? "FAQ intent and the agent searched the FAQ."
      : "FAQ intent but the agent never searched the FAQ.";
  }
  const off = actions.filter((a) => !steps.includes(a) && a !== "search-faq" && a !== "select-faq");
  if (off.length) return `Not allowed for this intent: ${[...new Set(off)].join(", ")}.`;
  const pos = actions.filter((a) => steps.includes(a)).map((a) => steps.indexOf(a));
  const back = pos.findIndex((p, i) => i > 0 && p < pos[i - 1]);
  if (back !== -1) {
    const used = actions.filter((a) => steps.includes(a));
    return `${used[back]} came after ${used[back - 1]}, against policy order.`;
  }
  return "Every button is a policy step, used in policy order.";
}
