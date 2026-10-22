import { FLOWS, FLOW_IDS } from "@/pipelines/cx-eval/src/contract.ts";
import { RUBRIC_V1 } from "@/pipelines/cx-eval/src/rubric/v1.ts";

// The rubric rendered straight from the object the judge prompt is built from,
// so this page and the prompt cannot drift apart.

export default function Rubric() {
  const r = RUBRIC_V1;
  const weights = r.cxiWeights as Record<string, number>;
  return (
    <details className="group rounded-2xl border border-border bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-5 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--ring)]">
        <span>
          <span className="block text-base font-semibold text-text">Read the rubric</span>
          <span className="block text-sm text-muted">The exact instructions the judge is given (rubric {r.version}, the version in use).</span>
        </span>
        <span aria-hidden className="text-soft transition-transform group-open:rotate-90">
          ▶
        </span>
      </summary>
      <div className="border-t border-border px-5 py-5">
        <h4 className="text-sm font-semibold text-text">How to use it</h4>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-muted">
          {r.general.map((g) => (
            <li key={g}>{g}</li>
          ))}
        </ul>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {r.dimensions.map((d) => (
            <section key={d.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-text">{d.name}</h4>
                <span className="text-xs text-soft">
                  {d.scoredBy === "llm" ? "LLM" : "code"} · {Math.round((weights[d.id] ?? 0) * 100) ? `${Math.round(weights[d.id] * 100)}% of the score` : "not in the score"}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{d.definition}</p>
              {d.levels && (
                <ul className="mt-2 space-y-0.5 text-xs text-muted">
                  {d.levels.map((l) => (
                    <li key={String(l.value)}>
                      <span className="font-mono text-text">{l.value}</span> {l.meaning}
                    </li>
                  ))}
                </ul>
              )}
              <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs leading-relaxed text-muted">
                {[...d.rules, ...d.na].map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
              {d.id === "intent" && (
                <p className="mt-2 text-xs text-soft">
                  Flows: {FLOW_IDS.map((f) => `${f} (${FLOWS[f].toLowerCase()})`).join("; ")}.
                </p>
              )}
            </section>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-soft">
          Version 2 keeps every rule above and adds one step for identity and policy: the judge must point to the exact position of each required
          button before giving a verdict.
        </p>
      </div>
    </details>
  );
}
