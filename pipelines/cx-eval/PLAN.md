# CX Auto-Evaluation Pipeline: Plan

An end-to-end pipeline that prepares customer-support conversations for an LLM judge, scores them against a written rubric, stores the scores, and combines inputs and outputs into metrics, drift monitoring, root cause analysis and a dashboard on priyankpatil.com (`/projects/cx-eval`).

The project is built to practise and demonstrate the work of a data engineer supporting LLM-based auto-evaluation: pipelines that feed models, pipelines that store what models return, and the reporting and investigations built on both.

## Goals

1. Understand each concept by building it, not just wiring tools together.
2. Ship a working prototype on the existing stack: Next.js on Vercel, Supabase Postgres, TypeScript scripts.
3. Cover every responsibility in the target role (see [Requirement coverage](#requirement-coverage)) and be honest about what is simulated.

## Data

**Source:** [ABCD, Action-Based Conversations Dataset](https://github.com/asappresearch/abcd) (ASAPP, NAACL 2021). The data files are downloaded by the pipeline, not committed.

What profiling showed (2026-10-21):

| | |
|---|---|
| Conversations | 10,042 (train 8,034 · dev 1,004 · test 1,004) |
| Size | median 21 turns (p10 14, p90 32), ~164 words |
| Turns | 95K agent · 89K customer · 36K logged agent actions (button clicks) |
| Contact reasons | 10 flows, roughly equal shares; 96 subflows: 46 action intents covered by `kb.json`, 50 FAQ intents |
| Customer tier | guest / bronze / silver / gold, ~25% each |
| Policy text | `guidelines.json`, natural-language agent guidelines per subflow |

**Key finding:** `kb.json` lists every step that *may* be needed for an intent, not a strict checklist. Conversations branch: troubleshooting stops once the issue is fixed, and refunds depend on an eligibility check. Exact matching gives a misleading 37% "compliance". Branch-aware checks give realistic ground truth:

| Ground-truth check (computed in code) | Pass rate |
|---|---|
| Identity steps present (`pull-up-account`, then `verify-identity` or `validate-purchase`) | 88.6% |
| Identity verified before account or order changes | 87.7% |
| Only actions allowed by policy for the intent | 78.4% |
| Actions in policy order | 90.8% |
| FAQ intents: agent searched the FAQ | 95.3% |

Because several dimensions have ground truth, the judge's **scoring accuracy is measurable**, not assumed.

### Synthetic additions (labelled as synthetic everywhere they appear)

ABCD has no timestamps, agents, channels or survey scores. The pipeline adds:

- **Dates:** conversations spread over 30 simulated days and delivered as daily batches (~335 per day loaded, ~20 per day scored).
- **Agents and channels:** 40 agents; channel is web chat or app chat.
- **CSAT:** a 1–5 survey score from ~25% of customers, correlated with true compliance and conversation length, plus noise.

## Architecture

The pipeline is **ELT**: scripts only move data (load raw data in, call the LLM), and all business logic (validation, enrichment, ground truth, prompt context, marts) runs as SQL inside Supabase. This mirrors the common Snowflake pattern of raw landing tables plus in-warehouse SQL transforms, and keeps every rule readable and runnable by hand in the SQL editor.

```
 ABCD (support system stand-in)
   │  daily batch (load script: download, split, insert raw jsonb; no logic)
   ▼
 raw_batches, raw_conversations (jsonb)
   │
   ▼  ── inside Supabase, SQL functions scheduled with pg_cron ──
 [1 Validate] cx_eval.validate_batch(date) ──► quarantine (record, reason)
   │
   ▼
 [2 Transform + enrich] cx_eval.transform_batch(date) ──► conversations (metadata, ground-truth flags), turns, csat_responses
   │
   ▼
 [3 Prompt assembly] ──► scoring_requests (rubric version, prompt hash, token estimate)
   │
   ▼
 [4 LLM judge] NVIDIA gpt-oss-20b, structured JSON, retry, validate
   │
   ▼
 [5 Store outputs] ──► scores (convo × dimension × rubric version × model), scoring_runs
   │
   ▼
 [6 Combine] marts: CXI daily / by cohort, judge accuracy, drift, pipeline health, retraining export
   │
   ├──► dashboard + exec summary (/projects/cx-eval)
   ├──► alerts (GitHub issues)
   └──► retraining export (judge-disagreement dataset)

 Every stage writes a row to pipeline_runs (rows in/out, status, duration, error).
 Orchestrated by a scheduled GitHub Actions workflow.
```

## Stack

Built on the stack the site already uses. Tools named in the role map onto it as follows:

| Concern | Choice | Notes |
|---|---|---|
| Warehouse | Supabase Postgres, schema `cx_eval` | Stands in for Snowflake. SQL kept to portable constructs. |
| Transforms | SQL functions and views inside Supabase, layered raw → enriched → marts | ELT. Same layering as dbt, without the tool. |
| Pipeline code | Thin TypeScript scripts run with `tsx`: the raw loader and the judge client | Extraction can't run in Supabase: a 121 MB JSON parse exceeds the Edge Function free-tier CPU limit (~2s). |
| Orchestration | GitHub Actions on a schedule (load, judge); `pg_cron` inside Supabase (validate, transform, mart refresh) | Vercel functions time out at 60s, which is too short for scoring batches. |
| LLM judge | NVIDIA API Catalog, `openai/gpt-oss-20b` | See [Model selection](#model-selection). |
| Alerting | Post-run checks that open GitHub issues | Free and visible. |
| Dashboard | Next.js page on priyankpatil.com | Reads marts through a read-only database role. |

## Schema (`cx_eval`)

```
Landing      raw_batches · raw_conversations (jsonb) · quarantine
Enriched     conversations · turns · csat_responses
LLM I/O      rubric_versions · scoring_requests · scores (long format)
Telemetry    pipeline_runs · scoring_runs · alerts
Marts        mart_cxi_daily · mart_cxi_by_cohort · mart_judge_accuracy · mart_drift
             mart_pipeline_health · mart_retraining_export          (views)
```

Its own schema, like the NL → SQL demo (`nlsql_demo`, `nlsql_rag`), so nothing is exposed through Supabase's public API. Scores are append-only and versioned by rubric and model: a re-score never overwrites history.

## Rubric (draft v1)

The rubric is a written document (`RUBRIC.md`, stage 2) that humans and the LLM follow alike. Each dimension has a definition, a decision rule, anchor examples drawn from real ABCD conversations, and "not applicable" rules. The judge prompt is generated from that document so the two cannot drift apart.

| Dimension | Scale | Scored by | Ground truth |
|---|---|---|---|
| Intent identified | one of 10 flows | LLM | ✅ true flow |
| Identity verification | pass / fail / n/a | LLM | ✅ gate check |
| Policy adherence | pass / fail | LLM | ✅ on-policy actions, in order |
| Resolution | resolved / partial / unresolved | LLM | ⚠️ partial (compared with CSAT) |
| Empathy and professionalism | 1–5 | LLM | ❌ judgment; calibrated against human scores |
| Efficiency | 1–5 | code: turns vs. the median for that intent | n/a, deterministic |

**CXI (0–100)** = policy 30% + identity 20% + resolution 25% + empathy 15% + efficiency 10%.

**Calibration:** a human scores ~15 conversations with the same rubric. Human–LLM agreement (Cohen's kappa) is reported next to accuracy against ground truth.

## Model selection

Tested 2026-10-21 on the NVIDIA API Catalog free tier (`NVIDIA_API_KEY`). `/v1/models` lists 83 models, but only 9 of 55 chat models respond for this account; the rest return 404 or time out.

**Working:** `nvidia/nemotron-3-ultra-550b-a55b`, `openai/gpt-oss-20b`, `nvidia/nemotron-3.5-lightning-30b-a3b`, `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`, `nvidia/ising-calibration-1.5-31b`, `google/diffusiongemma-26b-a4b-it`, `stepfun-ai/step-5-preview`, `z-ai/glm-5.3`, `meta/muse-glimmer-30b`.

Judge test on 12 labelled conversations (4 skipped identity checks, 4 clean, 4 FAQ):

| Model | Valid JSON | Identity correct | Skipped checks caught | Intent correct | p50 latency |
|---|---|---|---|---|---|
| **openai/gpt-oss-20b** | 12/12 | 11/12 | 4/4 | 4/12 | 8.9s |
| nvidia/nemotron-3-ultra-550b-a55b | 12/12 | 10/12 | 2/4 | 6/12 | 4.3s |
| z-ai/glm-5.3 | 8/12 | 8/12 | 1/4 | 5/12 | 46s, timeouts |
| stepfun-ai/step-5-preview | 8/12 | 8/12 | 2/4 | 6/12 | 53s, timeouts |
| nvidia/nemotron-3.5-lightning-30b-a3b | 6/12 | 6/12 | 1/4 | 4/12 | 34s, broken JSON |

**Decisions:**
- **Primary judge:** `openai/gpt-oss-20b`, about 820 tokens per conversation.
- **Day-18 incident model:** `nvidia/nemotron-3-ultra-550b-a55b`. The 12-chat test suggested it catches fewer skipped checks. On ~260 production chats the opposite held: it was more accurate on every checkable dimension, and more generous on the judgment-only ones (empathy, resolution), which raised CXI by ~5 points while CSAT stayed flat. The drift is real either way; the 12-chat result was not. See the model-switch RCA.
- **Throughput:** at most ~4 concurrent requests; back off and retry on 429. NVIDIA sends no rate-limit headers.
- **Intent accuracy** was low for every model with bare flow labels. The fix belongs in the prompt (add flow descriptions from `guidelines.json`), and the before/after is reported as a telemetry result.
- **Groq** stays the site's NL → SQL provider. Its free tier (8K tokens/min on `openai/gpt-oss-120b`) is too tight for batch scoring.

## Planted incidents

Each incident is detected by the pipeline's own monitoring, then diagnosed in a written RCA.

| Day | Incident | Type | Expected signal |
|---|---|---|---|
| 18 | Judge model switches to `nemotron-3-ultra` | Model-driven | Identity "fail" rate drops and judge accuracy falls, while ground-truth compliance is unchanged |
| 22 | Conversations that fail identity checks are routed to one agent cohort (assignment only; transcripts unaltered) | Real customer-experience change | Compliance and CXI drop for that cohort only; CSAT follows |
| 26 | A batch arrives with a renamed upstream field | Data-driven | Quarantine spikes, load-failure alert fires, scored volume drops |

**RCA method:** split each CXI change into an intent-mix effect and a within-intent effect, compare cohorts (agent, tier, channel), check judge telemetry (model, accuracy) and data telemetry (quarantine, volume, freshness) to decide whether a shift is data-, model- or customer-driven, and quantify the impact.

## Stages

| # | Stage | Builds | Status |
|---|---|---|---|
| 0 | Profile data, draft rubric and schema, select judge model | This plan | ✅ done |
| 1 | **ELT:** load raw ABCD batches → validate and quarantine (SQL) → transform and enrich (SQL) | `cx_eval` migration, raw loader script, `validate_batch` / `transform_batch` SQL functions, synthetic metadata, ground-truth flags | ✅ 30 days loaded; day 26 quarantined 230 records |
| 2 | **Rubric:** written definitions, decision rules, anchors; prompt generated from it; human calibration | `RUBRIC.md`, `rubric_versions`, `calibration/sheet-1.csv` | ✅ rubric; ✅ calibration sheet 1 (AI-assisted, see Decisions) |
| 3 | **Judge:** prompt assembly → LLM → JSON validation and retry | `scoring_requests`, `judge_config`, judge client | ✅ |
| 4 | **Store outputs:** append-only, versioned | `judge_results`, `scores`, `scoring_runs` | ✅ |
| 5 | **Combine:** inputs + outputs into marts; retraining export | mart views | ⬜ |
| 6 | **Orchestrate and alert:** scheduled workflow; post-run checks open GitHub issues | `.github/workflows/cx-eval.yml`, checks | ⬜ |
| 7 | **Incidents and RCA:** plant, detect, diagnose, quantify | incident switches, RCA write-ups | ⬜ |
| 8 | **Dashboard:** exec summary, early warnings, cohorts, judge health, RCA write-ups, pipeline diagram | `/projects/cx-eval`, project write-up | ⬜ |

If time runs short, reduce the dashboard polish in stage 8, not stages 6–7.

## Decisions made while building

- **The judge sees the logged contact reason, not the true one.** A synthetic disposition tag matches the true intent 91.8% of the time; policy context follows the tag. Giving the judge the true reason would hand it the intent answer. A wrong tag is also a realistic upstream data-quality issue.
- **Action turns carry the logged button id** (`button` in `JudgeContext.turns`), so the judge does not infer buttons from system messages. Three troubleshooting buttons share one message text.
- **Ground truth follows RUBRIC.md exactly**, so judge accuracy is measured against the rules the judge was given:
  - Action intents may use the general FAQ (`search-faq`, `select-faq`) but not topic searches such as `search-boots`. On-policy rate: 78.3%.
  - FAQ intents pass policy when any search ran (95.3%), even if the agent also opened the account.
- **Candidate rule for rubric v2:** opening a customer's account on an FAQ chat (226 chats, 10.7% of FAQ intents) is unnecessary access to personal data. v1 does not penalise it.
- **The v1 judge applied the identity rule by its spirit, ground truth by its letter.** On days 1–7 it caught 3 of 13 real identity failures: it passed chats verified with the wrong gate button, without `pull-up-account`, or after a read-only policy step. **Rubric v2** keeps every rule but makes the judge cite the required buttons' positions before deciding. Backtest on the same 137 chats (gpt-oss-20b): identity failures caught 23% → 85%, identity accuracy 82.1% → 92.5%, correct passes kept 96.3% → 94.4%, policy unchanged, +12% tokens.
- **Calibration sheet 1 is AI-assisted, not independent human labels (2026-10-30).** Claude scored the 15 chats blind from the transcripts and RUBRIC.md; Priyank accepted them without changes, and they are stored as rater `priyank` with that noted on every row. Results (`mart_human_agreement`, n = 45 judge verdicts across three setups): vs. ground truth 100% on intent, identity and policy, which mainly shows the written rules are consistent with the SQL; vs. judge, intent 93% (κ 0.92), identity 80% (κ 0.67), policy 78% (κ 0.25), resolution 93% (κ 0.00, almost all resolved), empathy 51% (κ 0.06). Empathy and resolution still need a genuinely human pass.
- **Backtests before rollout:** `create_backtest()` re-scores already-scored chats with their stored inputs under another rubric or model, so a comparison changes exactly one variable. Backtest scores are never production.
- **Model switch lives in `judge_config`**, a dated change log, so a root cause analysis can find it the way it would find a real deployment.

## Requirement coverage

| Role requirement | Covered by |
|---|---|
| Pipelines that ingest, transform and deliver support data to LLM scoring | Stages 1, 3 |
| Features for AI consumption: metadata enrichment, schema normalisation, prompt context assembly | Stages 1, 3 |
| Telemetry on model performance, scoring accuracy and concept drift | Stages 4, 5 |
| Orchestration with reliable, timely delivery | Stage 6 |
| Data quality checks and validation at ingestion | Stage 1 |
| Monitoring and alerting: pipeline health, freshness, scoring latency, load failures | Stages 5, 6 |
| Upstream sources and downstream consumers | ABCD as the support system and Postgres as the warehouse (simulated); dashboard, exec summary, retraining export (stages 5, 8) |
| RCA: data-driven vs. model-driven vs. real change | Stage 7 |
| Investigations: cohorts, isolating variables, quantifying impact | Stage 7 |
| Surfacing anomalies before escalation | Stages 6, 8 (early-warning checks and panel) |

**Simulated, and stated as such:** Snowflake (Postgres stands in), the enterprise support system (ABCD), timestamps, agents, channels and CSAT, and "multiple AIML workstreams" (one pipeline feeding three consumers).

## Configuration

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_DB_URL` | migrations, ETL (local) | Admin connection (session pooler) |
| `CXEVAL_DATABASE_URL` | pipeline (GitHub Actions) | Pipeline role: writes to `cx_eval` only |
| `CXEVAL_READ_URL` | dashboard (Vercel) | Read-only role for marts |
| `NVIDIA_API_KEY` | judge | NVIDIA API Catalog |
