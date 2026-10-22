"use client";

import { useId, useState, type ReactNode } from "react";

// Small shared pieces for the CX eval demo. Status colours come from CSS
// variables set on the page root (--cx-good, --cx-bad, --cx-warn), so light
// and dark themes both work without re-rendering.

export type Tone = "good" | "bad" | "warn" | "neutral" | "accent";

const TONE: Record<Tone, string> = {
  good: "border-[color:var(--cx-good-line)] bg-[color:var(--cx-good-soft)] text-[color:var(--cx-good)]",
  bad: "border-[color:var(--cx-bad-line)] bg-[color:var(--cx-bad-soft)] text-[color:var(--cx-bad)]",
  warn: "border-[color:var(--cx-warn-line)] bg-[color:var(--cx-warn-soft)] text-[color:var(--cx-warn)]",
  neutral: "border-border bg-surface-muted text-muted",
  accent: "border-[color:var(--ring)] bg-accent-soft text-accent",
};

export function Badge({ tone = "neutral", children, mono = false }: { tone?: Tone; children: ReactNode; mono?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[0.7rem] font-medium leading-tight ${
        mono ? "font-mono" : ""
      } ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/** ✓ / ✗ / ! with an accessible label. */
export function Mark({ ok, warn = false, label }: { ok: boolean | null; warn?: boolean; label?: string }) {
  if (ok === null) {
    return (
      <span aria-label={label ?? "not applicable"} className="inline-block w-4 text-center text-soft">
        –
      </span>
    );
  }
  const symbol = ok ? "✓" : warn ? "!" : "✗";
  const color = ok ? "text-[color:var(--cx-good)]" : warn ? "text-[color:var(--cx-warn)]" : "text-[color:var(--cx-bad)]";
  return (
    <span aria-label={label ?? (ok ? "pass" : warn ? "warning" : "fail")} role="img" className={`inline-block w-4 text-center font-semibold ${color}`}>
      {symbol}
    </span>
  );
}

export function verdictTone(value: string): Tone {
  if (value === "pass" || value === "resolved") return "good";
  if (value === "fail" || value === "unresolved") return "bad";
  if (value === "partial") return "warn";
  return "neutral";
}

/** A disclosure with a real button, so it is keyboard-operable and announces its state. */
export function Collapsible({
  summary,
  children,
  defaultOpen = false,
  className = "",
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-lg py-1 text-left text-sm font-medium text-text hover:text-accent"
      >
        <span aria-hidden className={`inline-block text-[0.65rem] text-soft transition-transform ${open ? "rotate-90" : ""}`}>
          ▶
        </span>
        {summary}
      </button>
      <div id={id} hidden={!open} className="pt-2">
        {open && children}
      </div>
    </div>
  );
}

/** Dark code surface, matching the NL → SQL demo. */
export function Code({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <pre
      tabIndex={0}
      aria-label={label}
      className={`m-0 max-h-[26rem] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[#1e1e1e] p-4 font-mono text-[0.72rem] leading-relaxed text-[#d4d4d4] ${className}`}
    >
      {children}
    </pre>
  );
}

/**
 * A small experiment at the bottom of a stage panel: a plain question, one
 * sentence on what will happen, then the controls (and a way to undo).
 */
export function TryThis({ question, explain, children }: { question: string; explain: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <aside aria-labelledby={id} className="mt-6 rounded-2xl border border-dashed border-border-strong bg-surface-muted p-4 sm:p-5">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-accent">Try this</p>
      <h4 id={id} className="mt-1 text-base font-semibold leading-snug text-text">
        {question}
      </h4>
      <p className="mt-1 text-sm leading-relaxed text-muted">{explain}</p>
      <div className="mt-3">{children}</div>
    </aside>
  );
}

/** A plain text-style button used for "undo" and "go to stage" links. */
export function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded text-sm font-medium text-accent underline underline-offset-4 hover:no-underline">
      {children}
    </button>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] uppercase tracking-[0.14em] text-soft">{label}</dt>
      <dd className="mt-0.5 text-sm text-text">{children}</dd>
    </div>
  );
}
