// Extract: download the ABCD dataset (once, cached on disk) and shape its
// reference data. ABCD stands in for the enterprise support system.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { FLOWS, type Flow } from "./contract";

const BASE_URL = "https://github.com/asappresearch/abcd/raw/master/data";
const FILES = ["abcd_v1.1.json.gz", "kb.json", "guidelines.json"] as const;

export interface AbcdConversation {
  convo_id: number;
  scenario: { flow: Flow; subflow: string; personal: { member_level?: string } };
  original: [speaker: "agent" | "customer" | "action", text: string][];
  delexed: { speaker: string; targets: [string, string, string, unknown, number] }[];
}

export interface AbcdData {
  conversations: AbcdConversation[];
  kb: Record<string, string[]>;
  guidelines: Record<string, { description: string; subflows: Record<string, Guideline> }>;
  /** sha256 of the downloaded archive, recorded with each batch for lineage. */
  checksum: string;
}

interface Guideline {
  actions: { button: string; text: string; subtext: string[] }[];
  instructions: string[];
}

/** Downloads the dataset into `dir` unless it is already there, then parses it. */
export async function extractAbcd(dir: string): Promise<AbcdData> {
  mkdirSync(dir, { recursive: true });
  for (const file of FILES) {
    const path = join(dir, file);
    if (existsSync(path)) continue;
    const res = await fetch(`${BASE_URL}/${file}`);
    if (!res.ok) throw new Error(`Download failed for ${file}: HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const archive = readFileSync(join(dir, "abcd_v1.1.json.gz"));
  const splits = JSON.parse(gunzipSync(archive).toString("utf8")) as Record<string, AbcdConversation[]>;
  return {
    conversations: Object.values(splits).flat(),
    kb: JSON.parse(readFileSync(join(dir, "kb.json"), "utf8")),
    guidelines: JSON.parse(readFileSync(join(dir, "guidelines.json"), "utf8")),
    checksum: createHash("sha256").update(archive).digest("hex"),
  };
}

// guidelines.json names subflows in prose ("Initiate Refund"); the data uses
// ids ("refund_initiate"). Most match as a word set; these do not.
const GUIDELINE_ALIASES: Record<string, string> = {
  reset_2fa: "Reset Two-Factor Auth",
  credit_card: "Invalid Credit Card",
  shopping_cart: "Cart Not Updating",
  search_results: "Search Not Working",
  slow_speed: "Website Too Slow",
  status: "Shipping Status",
  manage: "Manage Shipping",
  missing: "Missing Item",
  cost: "Shipping Cost",
};

function words(value: string): string[] {
  return value.toLowerCase().split(/[\s_\-]+/).filter(Boolean);
}

function guidelineFor(subflow: string, flow: Flow, data: AbcdData): string {
  // Section names normalise to flow ids ("Single-Item Query" → single_item_query).
  const section = Object.entries(data.guidelines).find(([name]) => words(name).join("_") === flow)?.[1];
  if (!section) return "";
  const names = Object.keys(section.subflows);
  // FAQ variants (boots_how_3, pricing_2, …) share one guideline per topic.
  const topic = subflow.split("_")[0];
  const name =
    GUIDELINE_ALIASES[subflow] ??
    names.find((n) => words(n).includes(topic) && words(n).includes("faq")) ??
    names.find((n) => words(subflow).every((w) => words(n).includes(w)));
  const g = name ? section.subflows[name] : undefined;
  if (!g) return "";
  const steps = g.actions.map((a) => {
    const sub = a.subtext.length ? ` (${a.subtext.join("; ")})` : "";
    return `${a.button !== "N/A" ? `[${a.button}] ` : ""}${a.text.replace(/\s+/g, " ").trim()}${sub}`;
  });
  return [...steps, ...g.instructions].join("\n");
}

export interface RefSubflow {
  subflow: string;
  flow: Flow;
  policySteps: string[];
  guideline: string;
  isFaq: boolean;
}

/** One row per subflow seen in the data, with its policy steps and guideline text. */
export function referenceSubflows(data: AbcdData): RefSubflow[] {
  const flows = new Map<string, Flow>();
  for (const c of data.conversations) flows.set(c.scenario.subflow, c.scenario.flow);
  return [...flows].sort().map(([subflow, flow]) => ({
    subflow,
    flow,
    policySteps: data.kb[subflow] ?? [],
    guideline: guidelineFor(subflow, flow, data),
    isFaq: !data.kb[subflow],
  }));
}

export const referenceFlows = () => Object.entries(FLOWS).map(([flow, description]) => ({ flow, description }));
