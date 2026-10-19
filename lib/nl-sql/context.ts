import { dbConfigured, hybridSearch, type RetrievedDoc } from "@/lib/nl-sql/db";
import { embed, embeddingsConfigured } from "@/lib/nl-sql/embed";
import { DEMO_TABLES, knowledge, tableDocs, type DemoTable } from "@/lib/nl-sql/knowledge";

export type RetrievalMode = "hybrid" | "full-text" | "static";

export interface RetrievedContext {
  mode: RetrievalMode;
  tables: DemoTable[];
  definitions: { title: string; content: string }[];
  examples: { question: string; sql: string }[];
  ids: string[];
  /** Retrieval could not reach the database, so execution should be skipped too. */
  dbUnavailable?: boolean;
}

const MAX_DEFINITIONS = 4;
const MAX_EXAMPLES = 3;

const isDemoTable = (t: string): t is DemoTable => (DEMO_TABLES as readonly string[]).includes(t);

function staticContext(): RetrievedContext {
  return {
    mode: "static",
    tables: [...DEMO_TABLES],
    definitions: knowledge.filter((d) => d.kind === "glossary").map((d) => ({ title: d.title, content: d.content })),
    examples: knowledge
      .filter((d) => d.kind === "example")
      .slice(0, MAX_EXAMPLES)
      .map((d) => ({ question: d.title, sql: d.sql! })),
    ids: [],
  };
}

function assemble(docs: RetrievedDoc[], mode: RetrievalMode): RetrievedContext {
  const definitions = docs.filter((d) => d.kind === "glossary").slice(0, MAX_DEFINITIONS);
  const examples = docs.filter((d) => d.kind === "example" && d.metadata.sql).slice(0, MAX_EXAMPLES);

  // Tables come from the strongest signals: table docs and definitions in the
  // top results, plus the tables used by the two closest examples.
  const tables = new Set<DemoTable>();
  for (const d of docs.slice(0, 8)) {
    if (d.kind === "table" || d.kind === "glossary") (d.metadata.tables ?? []).filter(isDemoTable).forEach((t) => tables.add(t));
  }
  for (const e of examples.slice(0, 2)) (e.metadata.tables ?? []).filter(isDemoTable).forEach((t) => tables.add(t));

  return {
    mode,
    tables: tables.size ? DEMO_TABLES.filter((t) => tables.has(t)) : [...DEMO_TABLES],
    definitions: definitions.map((d) => ({ title: d.title, content: d.content })),
    examples: examples.map((d) => ({ question: d.title, sql: d.metadata.sql! })),
    ids: docs.map((d) => d.id),
  };
}

/** Retrieves schema, definitions and examples for a question, degrading gracefully. */
export async function retrieveContext(question: string): Promise<RetrievedContext> {
  if (!dbConfigured()) return staticContext();

  let embedding: number[] | null = null;
  if (embeddingsConfigured()) {
    try {
      [embedding] = await embed([question]);
    } catch (err) {
      console.warn("[nl-sql] embedding failed, using full-text retrieval:", (err as Error).message);
    }
  }

  try {
    const docs = await hybridSearch(question, embedding);
    if (!docs.length) return { ...staticContext(), mode: embedding ? "hybrid" : "full-text" };
    return assemble(docs, embedding ? "hybrid" : "full-text");
  } catch (err) {
    console.warn("[nl-sql] retrieval failed, using static schema:", (err as Error).message);
    return { ...staticContext(), dbUnavailable: true };
  }
}

const rules = knowledge.filter((d) => d.kind === "rule").map((d) => `- ${d.content}`).join("\n");

export function buildSystemPrompt(context: RetrievedContext): string {
  const schema = context.tables.map((t) => tableDocs[t].content).join("\n\n");
  const definitions = context.definitions.length
    ? context.definitions.map((d) => `- ${d.title}: ${d.content}`).join("\n")
    : "- (none retrieved)";
  const examples = context.examples.length
    ? context.examples.map((e) => `Question: ${e.question}\nSQL:\n${e.sql}`).join("\n\n")
    : "(none retrieved)";

  return `You are a senior analytics engineer writing PostgreSQL for a pharmacy retail analytics database.
Translate the user's question into ONE correct, readable PostgreSQL SELECT query.

Return ONLY the SQL. No prose, no Markdown fences, no explanation. Use -- comments only for non-obvious logic.

Rules:
${rules}
- Use only the tables and columns listed below; never invent columns.
- Apply the business definitions exactly as written when the question uses those terms.

Schema (retrieved for this question):
${schema}

Business definitions:
${definitions}

Verified examples of similar questions (follow their patterns):
${examples}`;
}

export function buildRepairPrompt(question: string, failedSql: string, error: string): string {
  return `Question: ${question}

Your previous SQL failed:
${failedSql}

Error:
${error}

Return a corrected PostgreSQL SELECT query only.`;
}
