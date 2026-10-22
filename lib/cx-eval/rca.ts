// Root cause analyses for the three planted incidents, rendered on
// /projects/cx-eval. Each one answers: was the shift data-, model- or
// customer-driven, and how big was it?
//
// PLACEHOLDER CONTENT: replace every field once the investigation is written up.

export interface RcaWriteUp {
  id: string;
  title: string;
  date: string;
  type: "data" | "model" | "customer";
  question: string;
  finding: string;
  evidence: string[];
  impact: string;
  action: string;
}

export const rcaWriteUps: RcaWriteUp[] = [
  {
    id: "judge-model-switch",
    title: "[Placeholder] Judge model switch",
    date: "2026-10-10",
    type: "model",
    question: "[Placeholder] What changed in identity scores after Oct 10?",
    finding: "[Placeholder] Finding to be written.",
    evidence: ["[Placeholder] Evidence point 1", "[Placeholder] Evidence point 2"],
    impact: "[Placeholder] Impact to be quantified.",
    action: "[Placeholder] Action to be decided.",
  },
  {
    id: "t4-routing",
    title: "[Placeholder] Team T4 identity compliance drop",
    date: "2026-10-14",
    type: "customer",
    question: "[Placeholder] Why did T4 identity compliance fall?",
    finding: "[Placeholder] Finding to be written.",
    evidence: ["[Placeholder] Evidence point 1", "[Placeholder] Evidence point 2"],
    impact: "[Placeholder] Impact to be quantified.",
    action: "[Placeholder] Action to be decided.",
  },
  {
    id: "schema-rename",
    title: "[Placeholder] Oct 18 quarantine spike",
    date: "2026-10-18",
    type: "data",
    question: "[Placeholder] Why was most of the Oct 18 batch quarantined?",
    finding: "[Placeholder] Finding to be written.",
    evidence: ["[Placeholder] Evidence point 1", "[Placeholder] Evidence point 2"],
    impact: "[Placeholder] Impact to be quantified.",
    action: "[Placeholder] Action to be decided.",
  },
];
