"use client";

import { useId, useState, type ReactNode } from "react";

// Several views in the space of one, so switching tabs never resizes the card.
//   sizing "first":   the first tab sets the height; the others sit on top of
//                     it and scroll inside if longer (e.g. a long transcript).
//   sizing "tallest": every tab shares one grid cell, so the card is as tall as
//                     its tallest tab and nothing overflows.

export interface CardTab {
  key: string;
  label: string;
  content: ReactNode;
}

export default function CardTabs({
  label,
  tabs,
  sizing = "first",
  showNext = false,
}: {
  label: string;
  tabs: CardTab[];
  sizing?: "first" | "tallest";
  /** Adds a "Next: <tab> →" link under each tab but the last, for step-by-step tabs. */
  showNext?: boolean;
}) {
  const [active, setActive] = useState(tabs[0].key);
  const id = useId();
  const render = (t: CardTab, i: number) => (
    <>
      {t.content}
      {showNext && i < tabs.length - 1 && (
        <button type="button" onClick={() => setActive(tabs[i + 1].key)} className="mt-5 text-sm font-medium text-accent hover:underline">
          Next: {tabs[i + 1].label} →
        </button>
      )}
    </>
  );

  return (
    <div className="mt-6">
      <div role="tablist" aria-label={label} className="inline-flex max-w-full flex-wrap rounded-[20px] border border-border bg-surface-muted p-1 text-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`${id}-${t.key}-tab`}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            aria-controls={`${id}-${t.key}`}
            onClick={() => setActive(t.key)}
            className={`rounded-full px-4 py-1.5 font-medium transition-colors ${
              active === t.key ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {sizing === "tallest" ? (
        <div className="mt-5 grid">
          {tabs.map((t, i) => (
            <div
              key={t.key}
              id={`${id}-${t.key}`}
              role="tabpanel"
              aria-labelledby={`${id}-${t.key}-tab`}
              aria-hidden={active !== t.key}
              className={`[grid-area:1/1] ${active === t.key ? "" : "invisible"}`}
            >
              {render(t, i)}
            </div>
          ))}
        </div>
      ) : (
        <div className="relative mt-5">
          {tabs.map((t, i) =>
            i === 0 ? (
              <div key={t.key} id={`${id}-${t.key}`} role="tabpanel" aria-labelledby={`${id}-${t.key}-tab`} className={active === t.key ? "" : "invisible"}>
                {render(t, i)}
              </div>
            ) : (
              <div
                key={t.key}
                id={`${id}-${t.key}`}
                role="tabpanel"
                aria-labelledby={`${id}-${t.key}-tab`}
                hidden={active !== t.key}
                className="absolute inset-0"
              >
                {render(t, i)}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
