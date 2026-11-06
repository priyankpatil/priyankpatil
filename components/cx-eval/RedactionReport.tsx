import type { ReactNode } from "react";
import report from "@/pipelines/cx-eval/redaction-eval.json";
import { Fact } from "./ui";

const FIELD: Record<string, string> = {
  name: "Full name",
  name_part: "First or last name",
  username: "Username",
  order_id: "Order ID",
  account_id: "Account ID",
  email: "Email",
  zip_code: "ZIP code",
  city: "City",
  street_address: "Street address",
  phone: "Phone",
  pin: "PIN",
  security_answer: "Security answer",
  password: "Password",
};

/** Made-up examples (not from the dataset): the highlighted value is what the rules let through. */
const EXAMPLES: Record<string, { agent?: string; speaker?: string; text: ReactNode; why: string }> = {
  bare_reply: {
    agent: "Sure, and who am I speaking with today?",
    text: <M>Dana Whitfield</M>,
    why: "The answer is fine, but the rules only know a fixed set of question phrasings, or the question came a few turns earlier.",
  },
  passing_mention: {
    text: (
      <>
        Great, thanks for your patience <M>Dana</M>! Is the <M>Fresno</M> store open at 8?
      </>
    ),
    why: "Nothing marks it as personal: no label, no question. A miss earlier in the chat also means the name is never learned, so later mentions slip too.",
  },
  packed: {
    agent: "Can I get your name and account ID?",
    text: (
      <>
        <M>Dana Whitfield</M> [ACCOUNT_ID_1]
      </>
    ),
    why: "The account ID has a recognisable shape and is caught; the name next to it has neither a shape nor its own label.",
  },
  cue_unmatched: {
    text: (
      <>
        Hi, my name is <M>Dana Whitfield</M> and I&apos;d like to ask about a jacket
      </>
    ),
    why: "The cue is there, but the rule expects the name to end the phrase. Every new sentence shape needs another rule.",
  },
  action_line: {
    speaker: "ACTION",
    text: (
      <>
        Account has been updated with <M>Dana Whitfield</M>.
      </>
    ),
    why: "System lines are matched by template, and this one has no template.",
  },
};

function M({ children }: { children: ReactNode }) {
  return <mark className="rounded bg-[color:var(--cx-bad-soft)] px-0.5 text-text ring-1 ring-[color:var(--cx-bad-line)]">{children}</mark>;
}

function Ph({ children }: { children: ReactNode }) {
  return <span className="rounded bg-[color:var(--cx-good-soft)] px-0.5 text-text ring-1 ring-[color:var(--cx-good-line)]">{children}</span>;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const PLACEHOLDER = /(\[[A-Z_]+?(?:_\d+)?\])/;

type Turn = { speaker: string; text: string; button?: string };

/**
 * Lines the redaction changed, with each original value next to its placeholder.
 * Masking leaves the text between values untouched, so walking the masked line's
 * literal pieces through the original recovers what each placeholder replaced.
 */
function pairs(before: string, after: string): { value: string; placeholder: string }[] | null {
  const parts = after.split(PLACEHOLDER);
  if (!before.startsWith(parts[0])) return null;
  let pos = parts[0].length;
  const out: { value: string; placeholder: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const next = parts[i + 1];
    const last = i + 2 >= parts.length;
    const end = last && next === "" ? before.length : before.indexOf(next, pos + 1);
    if (end === -1 || (last && !before.endsWith(next))) return null;
    out.push({ value: before.slice(pos, end), placeholder: parts[i] });
    pos = end + next.length;
  }
  return out;
}

function Highlighted({ text, marks, Tag }: { text: string; marks: string[]; Tag: typeof M }) {
  const nodes: ReactNode[] = [];
  let rest = text;
  marks.forEach((m, i) => {
    const at = rest.indexOf(m);
    if (at === -1) return;
    nodes.push(rest.slice(0, at), <Tag key={i}>{m}</Tag>);
    rest = rest.slice(at + m.length);
  });
  nodes.push(rest);
  return <>{nodes}</>;
}

function ThisChat({ delivered, masked }: { delivered: Turn[]; masked: Turn[] }) {
  const changed = delivered.map((t, i) => ({ t, after: masked[i]?.text ?? t.text, i })).filter((x) => x.after !== x.t.text);
  const values = changed.reduce((n, x) => n + (pairs(x.t.text, x.after)?.length ?? 0), 0);
  if (!changed.length) return <p>Nothing in this chat needed masking.</p>;
  return (
    <div>
      <p className="mb-3">
        {fmt(values)} values masked in {changed.length} of {delivered.length} lines. Red is what the support system sent; green is what the database stores and the
        judge reads.
      </p>
      <ol className="max-h-[26rem] space-y-2 overflow-auto rounded-xl border border-border bg-surface-muted p-3 font-mono text-xs leading-5" tabIndex={0} aria-label="Masked lines">
        {changed.map(({ t, after, i }) => {
          const p = pairs(t.text, after);
          return (
            <li key={i} className="text-text">
              <div className="text-[0.65rem] uppercase tracking-[0.12em] text-soft">
                {t.speaker === "action" ? `action · ${t.button}` : t.speaker} · line {i + 1}
              </div>
              <div>
                <span className="sr-only">Before: </span>
                {p ? <Highlighted text={t.text} marks={p.map((x) => x.value)} Tag={M} /> : t.text}
              </div>
              <div>
                <span className="sr-only">After: </span>
                {p ? <Highlighted text={after} marks={p.map((x) => x.placeholder)} Tag={Ph} /> : after}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function H4({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-soft">{children}</h4>;
}

export function RedactionReport({ delivered, masked }: { delivered: Turn[]; masked: Turn[] }) {
  const { overall, recall, missesByReason } = report;
  const fields = [...recall].sort((a, b) => (a.recallPct ?? 0) - (b.recallPct ?? 0));
  return (
    <div className="space-y-6 text-sm leading-6 text-muted">
      <div>
        <H4>This chat</H4>
        <ThisChat delivered={delivered} masked={masked} />
      </div>

      <div>
        <H4>Across all {fmt(report.conversations)} chats</H4>
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Values removed">{overall.recallPct}%</Fact>
          <Fact label="Masks on personal data">{overall.precisionPct}%</Fact>
          <Fact label="Values checked">{fmt(overall.present)}</Fact>
          <Fact label="Missed">{fmt(overall.missed)}</Fact>
        </dl>
        <p className="mt-3">
          Rules, not a model: patterns, the agent&apos;s question just before, known system lines, and spreading a value found once to the rest of the chat. Scored
          against the profiles the crowdworkers role-played. The profiles are used only to score, never to redact, and no
          values are kept. Tuning stopped here on purpose: the misses below show where rules run out.
        </p>
      </div>

      <div>
        <H4>Removed, by field</H4>
        <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {fields.map((f) => (
            <li key={f.type} className="grid grid-cols-[8.5rem_1fr_3.25rem] items-center gap-2 text-xs">
              <span className="truncate text-text">{FIELD[f.type] ?? f.type}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <span className="block h-full rounded-full bg-accent" style={{ width: `${f.recallPct ?? 0}%` }} />
              </span>
              <span className="text-right tabular-nums" title={`${fmt(f.present - f.missed)} of ${fmt(f.present)}`}>
                {f.recallPct}%
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <H4>Why the {fmt(overall.missed)} misses happen</H4>
        <ol className="space-y-3">
          {missesByReason.map((r) => {
            const ex = EXAMPLES[r.reason];
            return (
              <li key={r.reason} className="rounded-xl border border-border px-3.5 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-text">{r.label}</span>
                  <span className="shrink-0 tabular-nums text-xs text-soft">
                    {fmt(r.missed)} · {Math.round((100 * r.missed) / overall.missed)}%
                  </span>
                </div>
                {ex ? (
                  <>
                    <div className="mt-2 space-y-1 rounded-lg bg-surface-muted px-3 py-2 font-mono text-xs leading-5 text-text">
                      {ex.agent ? <div className="text-soft">AGENT: {ex.agent}</div> : null}
                      <div>{ex.speaker ?? "CUSTOMER"}: {ex.text}</div>
                    </div>
                    <p className="mt-2 text-xs leading-5">{ex.why}</p>
                  </>
                ) : null}
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-xs text-soft">Examples are made up to show the shape; counts are from the evaluation.</p>
      </div>

      <div className="rounded-xl border border-border bg-surface-muted px-3.5 py-3">
        <h4 className="mb-1 font-medium text-text">Where a model would do better</h4>
        <p>
          Every miss above is a missing cue. A named-entity model reads the whole sentence instead: &ldquo;Dana Whitfield here&rdquo; is a name because of how it is
          written and where it sits, not because someone typed &ldquo;name:&rdquo;. It would cost an inference call per chat, labelled examples to fine-tune on,
          and misses that are harder to explain than a rule. The evaluation does not depend on how redaction works, so a model can be scored on the same{" "}
          {fmt(overall.present)} values and compared field by field before it replaces anything.
        </p>
      </div>
    </div>
  );
}
