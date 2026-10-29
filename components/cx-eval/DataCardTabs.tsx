import { Fragment, type ReactNode } from "react";
import type { DemoChat } from "@/lib/cx-eval/types";
import CardTabs from "./CardTabs";

export default function DataCardTabs({ overview, chat }: { overview: ReactNode; chat: DemoChat }) {
  return (
    <CardTabs
      label="The data"
      tabs={[
        { key: "overview", label: "About the data", content: <Fragment key="overview">{overview}</Fragment> },
        { key: "sample", label: "Sample chat", content: <SampleChat key="sample" chat={chat} /> },
      ]}
    />
  );
}

function SampleChat({ chat }: { chat: DemoChat }) {
  const turns = chat.raw.transcript ?? [];
  const reason = chat.enrich.trueSubflow.replace(/_/g, " ");
  return (
    <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-5 md:grid-cols-[1.5fr_1fr] md:grid-rows-1">
      <ol className="h-full min-h-0 space-y-2 overflow-y-auto rounded-2xl border border-border bg-surface-muted p-3 sm:p-4" aria-label="Sample conversation">
        {turns.map((t, i) =>
          t.speaker === "action" ? (
            <li key={i} className="flex flex-wrap items-baseline justify-center gap-x-2 py-0.5 text-center text-xs text-soft">
              <code className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[0.7rem] text-text">{t.button}</code>
              <span>{t.text.replace(/\s+/g, " ").trim()}</span>
            </li>
          ) : (
            <li key={i} className={`flex ${t.speaker === "agent" ? "justify-end" : "justify-start"}`}>
              <p
                className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm leading-snug ${
                  t.speaker === "agent" ? "rounded-br-md bg-accent-soft text-text" : "rounded-bl-md bg-surface text-text"
                }`}
              >
                <span className="sr-only">{t.speaker === "agent" ? "Agent: " : "Customer: "}</span>
                {t.text.trim()}
              </p>
            </li>
          )
        )}
      </ol>

      <div className="space-y-3 text-sm leading-relaxed">
        <div>
          <h3 className="font-semibold text-text">What you&apos;re looking at</h3>
          <p className="mt-1 text-muted">One chat as recorded: customer left, agent right, button clicks in between.</p>
        </div>
        <div>
          <dl className="space-y-2 text-muted">
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-soft">Real reason for contact</dt>
              <dd className="text-text">{reason.charAt(0).toUpperCase() + reason.slice(1)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-soft">Policy steps for it</dt>
              <dd className="mt-1 flex flex-wrap gap-1">
                {chat.context.policySteps.map((s) => (
                  <code key={s} className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-[0.7rem] text-text">
                    {s}
                  </code>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.12em] text-soft">Size</dt>
              <dd>
                {chat.enrich.nTurns} turns · {chat.enrich.nActions} button clicks
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
