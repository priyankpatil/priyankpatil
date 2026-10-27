export interface WikiEdit {
  id: string;
  wiki: string;
  title: string;
  timestamp: number;
  receivedAt: number;
  bot: boolean;
  kind: "edit" | "new";
  oldLength: number;
  newLength: number;
}

export interface EnrichedEdit extends WikiEdit {
  language: string;
  delta: number;
  enrichedAt: number;
}

export interface DisplayEdit {
  id: string;
  wiki: string;
  title: string;
  timestamp: number;
  bot: boolean;
  kind: "edit" | "new";
  delta: number;
  partition: number;
  offset: string;
  receivedAt: number;
  enrichedAt: number;
}

export interface WikiFrame {
  at: number;
  edits: DisplayEdit[];
  stats: { events: number; bots: number; bytes: number; late: number; duplicates: number; startedAt: number };
  languages: { wiki: string; count: number }[];
  trending: { wiki: string; title: string; count: number; previous: number }[];
  activity: { minute: number; count: number }[];
  pipeline: { lag: number; sourceToSinkMs: number | null };
}

export interface WikiResponse {
  mode: "live" | "stale" | "preview" | "budget" | "unavailable";
  frame: WikiFrame | null;
}

export function articleUrl(edit: Pick<DisplayEdit, "wiki" | "title">): string {
  const language = edit.wiki.replace(/wiki$/, "");
  if (!/^[a-z][a-z0-9-]{0,19}$/.test(language)) return "https://www.wikipedia.org/";
  return `https://${language}.wikipedia.org/wiki/${encodeURIComponent(edit.title.replace(/ /g, "_"))}`;
}
