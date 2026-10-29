import type { ReactNode } from "react";
import Navigation from "@/components/Navigation";
import CxArchitecture from "@/components/cx-eval/CxArchitecture";
import DataCardTabs from "@/components/cx-eval/DataCardTabs";
import Metrics from "@/components/cx-eval/Metrics";
import PipelineDemo from "@/components/cx-eval/PipelineDemo";
import { demo } from "@/lib/cx-eval/demo";

export const metadata = {
  title: "Customer Support Evaluation using an LLM",
  description:
    "A framework for evaluating customer support conversations with an LLM: data pipelines, a rubric-based LLM judge validated against ground truth, and metrics for model accuracy and business processes.",
};

// A typical chat for the data card: short, several button clicks, a clear intent.
const sampleChat = demo.chats.find((c) => c.id === "abcd-1501") ?? demo.chats[0];

// Chart and status colours: light and dark steps (validated for colour-blind
// separation), scoped to this page so globals stay untouched.
const PALETTE =
  "[--cx-1:#2a78d6] [--cx-2:#eb6834] [--cx-neutral:#8a96ab] " +
  "[--cx-good:#1a7f37] [--cx-good-soft:rgba(26,127,55,0.08)] [--cx-good-line:rgba(26,127,55,0.3)] " +
  "[--cx-bad:#c62828] [--cx-bad-soft:rgba(198,40,40,0.07)] [--cx-bad-line:rgba(198,40,40,0.3)] " +
  "[--cx-warn:#9a5700] [--cx-warn-soft:rgba(161,92,0,0.08)] [--cx-warn-line:rgba(161,92,0,0.3)] " +
  "dark:[--cx-1:#3987e5] dark:[--cx-2:#d95926] dark:[--cx-neutral:#6b7891] " +
  "dark:[--cx-good:#3fb950] dark:[--cx-good-soft:rgba(63,185,80,0.12)] dark:[--cx-good-line:rgba(63,185,80,0.35)] " +
  "dark:[--cx-bad:#f07070] dark:[--cx-bad-soft:rgba(240,112,112,0.12)] dark:[--cx-bad-line:rgba(240,112,112,0.35)] " +
  "dark:[--cx-warn:#e3a33b] dark:[--cx-warn-soft:rgba(227,163,59,0.12)] dark:[--cx-warn-line:rgba(227,163,59,0.35)]";

function SectionHead({ id, kicker, title, children }: { id: string; kicker: string; title: string; children?: ReactNode }) {
  return (
    <header className="max-w-3xl">
      <p className="kicker mb-2">{kicker}</p>
      <h2 id={id} className="text-[clamp(1.6rem,3.2vw,2.2rem)] font-semibold leading-tight tracking-tight text-text">
        {title}
      </h2>
      {children && <p className="mt-3 text-lg leading-relaxed text-muted">{children}</p>}
    </header>
  );
}

export default function CxEvalPage() {
  return (
    <>
      <Navigation />
      <main className={`page-pad ${PALETTE}`}>
        <div className="shell flex flex-col gap-24">
          {/* Hero */}
          <section className="max-w-3xl">
            <p className="kicker mb-3">Project · LLM evaluation data pipeline</p>
            <h1 className="heading-lg font-semibold">
              Customer Support Evaluation <span className="text-accent">using an LLM</span>
            </h1>
            <p className="body-lg mt-4">
              A framework for evaluating customer support conversations with an LLM. This project walks through building data pipelines that normalize the
              conversation data, an LLM that scores each conversation against a defined rubric, and validation of the results against ground truth. It also
              provides metrics to measure the model&apos;s accuracy and support business processes.
            </p>
          </section>

          {/* Data */}
          {/* Reads as part of the hero, so sits closer than the page's section gap. */}
          <section aria-labelledby="data" className="-mt-14">

            <article className="rounded-[22px] border border-border bg-surface p-5 sm:p-7">
              <p className="kicker mb-2">The data</p>
              <h2 id="data" className="text-[clamp(1.35rem,2.6vw,1.8rem)] font-semibold leading-tight tracking-tight text-text">
                10,042 real customer support chats
              </h2>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-muted">
                The conversations come from ABCD, the Action-Based Conversations Dataset, published by ASAPP Research in 2021. Trained agents chatted with
                customers of a fictional online clothing store, following the store&apos;s written policies.
              </p>

              <DataCardTabs
                chat={sampleChat}
                overview={
                    <div className="grid gap-6 md:grid-cols-2">
                      <div>
                        <h3 className="text-sm font-semibold text-text">What each chat contains</h3>
                        <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
                          <li>
                            <strong className="font-medium text-text">The conversation</strong>, turn by turn, between customer and agent.
                          </li>
                          <li>
                            <strong className="font-medium text-text">Every button the agent clicked</strong>, such as{" "}
                            <code className="text-[0.85em]">verify-identity</code> or <code className="text-[0.85em]">offer-refund</code>.
                          </li>
                          <li>
                            <strong className="font-medium text-text">The real reason for the contact</strong>, one of 55 intents such as a refund or a password reset,
                            with the policy steps the agent should follow.
                          </li>
                        </ul>
                        <p className="mt-3 text-sm leading-relaxed text-muted">
                          Because the buttons and the policy are both recorded, the right answer for policy questions can be computed from the data. The
                          LLM&apos;s scores are checked against it.
                        </p>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-text">What this project added</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted">
                          The dataset has no dates or agents, so these were simulated:
                        </p>
                        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-muted">
                          <li>· 30 days of daily batches</li>
                          <li>· 40 agents in 4 teams, and two chat channels</li>
                          <li>· Customer survey ratings (CSAT)</li>
                          <li>· The contact reason the agent logged, wrong in about 8% of chats</li>
                          <li>· Three deliberate incidents, to test the monitoring</li>
                        </ul>
                      </div>
                    </div>
                }
              />
              <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4">
                <a href="https://github.com/asappresearch/abcd" target="_blank" rel="noopener noreferrer" className="pill-link">
                  View the dataset on GitHub ↗
                </a>
                <a
                  href="https://arxiv.org/abs/2104.00783"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-muted underline decoration-border underline-offset-4 hover:text-text"
                >
                  Read the paper ↗
                </a>
                <span className="text-xs text-soft">Chen et al., NAACL 2021 · MIT licence</span>
              </div>
            </article>
          </section>

          {/* Demo */}
          <section aria-labelledby="demo" className="flex flex-col gap-6">
            <SectionHead id="demo" kicker="Interactive demo" title="Follow one conversation through the pipeline">
              Pick a chat and click through the eight stages to see the output of each one. Some stages have a &ldquo;Try this&rdquo; box.
            </SectionHead>
            <PipelineDemo />
          </section>

          {/* Metrics */}
          <section aria-labelledby="metrics" className="flex flex-col gap-6">
            <SectionHead id="metrics" kicker="Metrics" title="Judge quality, pipeline health and support performance">
              Hover a chart for exact values.
            </SectionHead>
            <Metrics />
          </section>

          {/* Architecture */}
          <CxArchitecture />
        </div>
      </main>
    </>
  );
}
