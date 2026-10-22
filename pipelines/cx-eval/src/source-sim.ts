// Simulated upstream support system. ABCD has no dates, agents, channels or
// disposition tags, so this module invents them, deterministically (hash of
// the conversation id), and delivers the conversations as daily batches.
// It is the ONLY place synthetic upstream data is created; everything after
// the raw landing table treats these records as real source data.
//
// Planted incidents (PLAN.md → Planted incidents) that originate upstream:
//   day 22+  conversations that skip identity checks are routed to team T4
//   day 26   an upstream deploy at noon renames `transcript` to `messages`
// The day-18 judge model switch happens at scoring time, not here.

import { createHash } from "node:crypto";
import type { AbcdConversation, RefSubflow } from "./abcd";
import { IDENTITY_GATE_ACTIONS } from "./contract";

export const SIM_DAYS = 30;
export const SIM_START = "2026-09-23"; // day 1; day 30 is 2026-10-22
export const AGENTS = 40;
export const COHORT_INCIDENT_DAY = 22;
export const SCHEMA_INCIDENT_DAY = 26;
const MISTAG_RATE = 0.08;
const COHORT_ROUTE_RATE = 0.7;

/** Deterministic uniform [0, 1). Mirrors cx_eval.hash_unit() in SQL. */
export function hashUnit(key: string, salt: string): number {
  return parseInt(createHash("md5").update(`${key}:${salt}`).digest("hex").slice(0, 8), 16) / 2 ** 32;
}

export function dayDate(day: number): string {
  const d = new Date(`${SIM_START}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + day - 1);
  return d.toISOString().slice(0, 10);
}

export interface SourceRecord {
  conversation_id: string;
  started_at: string;
  channel: "web_chat" | "app_chat";
  agent_id: string;
  logged_reason: string;
  customer: { member_level: string | null };
  transcript?: { speaker: string; text: string; button?: string }[];
  messages?: SourceRecord["transcript"];
}

export interface Batch {
  day: number;
  date: string;
  incident: string | null;
  records: SourceRecord[];
  labels: { convo_id: string; true_flow: string; true_subflow: string }[];
}

const pick = <T>(items: T[], u: number): T => items[Math.min(items.length - 1, Math.floor(u * items.length))];
const agentId = (n: number) => `A${String(n).padStart(2, "0")}`;

/** True when the agent skipped a required identity step (same rule as cx_eval.gt_identity). */
function skipsIdentity(actions: string[], steps: string[]): boolean {
  const gate = steps.findIndex((s) => (IDENTITY_GATE_ACTIONS as readonly string[]).includes(s));
  if (gate === -1) return false;
  return steps.slice(0, gate + 1).some((s) => !actions.includes(s));
}

export function buildBatches(conversations: AbcdConversation[], subflows: RefSubflow[]): Batch[] {
  const byFlow = new Map<string, string[]>();
  for (const s of subflows) byFlow.set(s.flow, [...(byFlow.get(s.flow) ?? []), s.subflow]);
  const allSubflows = subflows.map((s) => s.subflow);
  const steps = new Map(subflows.map((s) => [s.subflow, s.policySteps]));

  const batches: Batch[] = Array.from({ length: SIM_DAYS }, (_, i) => ({
    day: i + 1,
    date: dayDate(i + 1),
    incident: i + 1 === COHORT_INCIDENT_DAY ? "cohort_routing_start" : i + 1 === SCHEMA_INCIDENT_DAY ? "schema_rename" : null,
    records: [],
    labels: [],
  }));

  for (const c of conversations) {
    const id = `abcd-${c.convo_id}`;
    const day = 1 + Math.floor(hashUnit(id, "day") * SIM_DAYS);
    const batch = batches[day - 1];
    const { flow, subflow } = c.scenario;

    // 08:00–22:00 UTC within the batch day.
    const seconds = Math.floor((8 + hashUnit(id, "time") * 14) * 3600);
    const startedAt = new Date(`${batch.date}T00:00:00Z`).getTime() + seconds * 1000;

    // ~8% of dispositions are wrong: usually a sibling reason, sometimes another flow.
    let loggedReason = subflow;
    if (hashUnit(id, "mistag") < MISTAG_RATE) {
      const siblings = (byFlow.get(flow) ?? []).filter((s) => s !== subflow);
      const pool = hashUnit(id, "mistag-scope") < 0.75 && siblings.length ? siblings : allSubflows.filter((s) => s !== subflow);
      loggedReason = pick(pool, hashUnit(id, "mistag-pick"));
    }

    const actions = c.delexed.filter((t) => t.speaker === "action").map((t) => t.targets[2]);
    let agent = 1 + Math.floor(hashUnit(id, "agent") * AGENTS);
    if (day >= COHORT_INCIDENT_DAY && skipsIdentity(actions, steps.get(subflow) ?? []) && hashUnit(id, "route") < COHORT_ROUTE_RATE) {
      agent = 31 + Math.floor(hashUnit(id, "route-agent") * 10); // team T4: A31–A40
    }

    const transcript = c.original.map(([speaker, text], i) =>
      speaker === "action" ? { speaker, text, button: c.delexed[i].targets[2] } : { speaker, text }
    );

    const record: SourceRecord = {
      conversation_id: id,
      started_at: new Date(startedAt).toISOString(),
      channel: hashUnit(id, "channel") < 0.6 ? "web_chat" : "app_chat",
      agent_id: agentId(agent),
      logged_reason: loggedReason,
      // Names, emails and phone numbers in the scenario are left behind: the
      // pipeline only needs the tier, and PII should not travel downstream.
      customer: { member_level: c.scenario.personal.member_level ?? null },
    };
    // The upstream deploy at 12:00 renames the field for the rest of day 26.
    if (day === SCHEMA_INCIDENT_DAY && seconds >= 12 * 3600) record.messages = transcript;
    else record.transcript = transcript;

    batch.records.push(record);
    batch.labels.push({ convo_id: id, true_flow: flow, true_subflow: subflow });
  }
  return batches;
}
