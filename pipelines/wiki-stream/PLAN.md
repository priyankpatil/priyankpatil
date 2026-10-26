# Live Wikipedia: Kafka Streaming Pipeline: Plan

A real-time pipeline that streams every edit made to Wikipedia through Kafka, enriches it, detects pages that suddenly attract many edits ("breaking news"), and shows it all on priyankpatil.com (`/projects/wiki-stream`) as a live feed that scrolls like a YouTube live chat.

Like the [CX eval project](../cx-eval/PLAN.md), it is built to practise and demonstrate the work of a data engineer, this time on streaming: producers and consumers, topics and partitions, consumer groups and offsets, delivery guarantees, windowed aggregation, dead-letter handling, lag monitoring and retention.

## Goals

1. Understand each streaming concept by building it, not just wiring tools together.
2. Run on free tiers only: Aiven (Kafka), Supabase (compute, storage, realtime), Vercel (site).
3. Keep storage bounded: Supabase holds a short rolling window, never the full history.
4. Be honest about latency and limits: the page shows measured end-to-end lag, not a claim.

## Data

**Source:** [Wikimedia EventStreams](https://stream.wikimedia.org/v2/stream/recentchange) `recentchange`: every edit, page creation and log action across all Wikimedia wikis, as Server-Sent Events. Public, no API key, real data (nothing simulated).

Profiling (to measure, stage 0):

| | |
|---|---|
| Events per second | to measure (public estimates: ~20–40/s) |
| Event size | to measure (raw JSON; trimmed size after projection) |
| Share that are edits / new pages / log actions | to measure |
| Share by bots | to measure |
| Wikis and languages seen per hour | to measure |
| Gaps and reconnects | to measure (SSE supports resuming with `Last-Event-ID`) |

**Content safety:** page titles and short edit summaries only. No article text is fetched. Edit summaries are free text, so the feed shows them truncated and only for content namespaces; a small deny-list filter runs in the enrich stage.

## Architecture

```
 Wikimedia EventStreams (SSE, real time)
   │
   ▼
 [1 Ingest]   producer: validate against contract → trim → key by wiki
   │            resumes from the last event id stored in Supabase (no gaps, no replays)
   ├──► topic wiki.edits.raw        (6 partitions, key = wiki, 24h retention)
   └──► topic wiki.edits.dlq        (malformed or contract-violating events + reason)
   │
   ▼
 [2 Enrich]   consumer group wiki-enrich: language and flag from the wiki, bot/human,
   │            size delta, edit type, namespace filter, content filter
   └──► topic wiki.edits.enriched
   │
   ▼
 [3 Aggregate] consumer group wiki-aggregate: tumbling 10s windows (edits, bytes,
   │            bots, languages) and a trending detector (edits per page in a sliding
   │            5-minute window vs. its baseline)
   └──► topic wiki.trends
   │
   ▼
 [4 Sink]     consumer group wiki-sink → Supabase (idempotent upserts)
   │            feed frames (1 per second), 10-second metrics, trending pages, lag
   ▼
 Supabase schema wiki_stream ──► Realtime ──► /projects/wiki-stream (live feed, charts, health)
   │
   └── pg_cron: retention every 5 minutes · freshness and lag checks → alerts
```

Every stage records throughput, errors and lag, so the page can show the pipeline's health next to its output.

## Why one frame per second

Pushing every edit to every viewer through Supabase Realtime would cost ~30 messages per second per viewer and exhaust the free monthly message quota within hours of viewing. Instead the sink writes **one frame per second**: the second's sampled edits (up to ~30) plus that second's counters. The browser plays each frame out smoothly, so the feed still scrolls like a live chat, at ~1 message per second per viewer.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Message broker | Apache Kafka on the **Aiven free tier** | Real Kafka, no card. Fixed size, ~250 KiB/s, ≤3 days retention, powers off when idle (to verify). |
| Producer and consumers | TypeScript workers on **Supabase Edge Functions**, started every minute by `pg_cron`, each running ~55 s | Vercel functions time out at 60 s and Hobby cron is daily, so Vercel only serves the page. Fallback: a long-running Node worker if Edge Functions cannot open Kafka connections or exceed the CPU budget (stage 0 spike). |
| Storage | Supabase Postgres, schema `wiki_stream` | Rolling window only (see Retention). |
| Live updates | Supabase Realtime | Browser subscribes to frames; read-only access to `wiki_stream` frames and metrics only. |
| Local development | Apache Kafka in KRaft mode (no ZooKeeper) | Same client code as production. |
| Dashboard | Next.js page on priyankpatil.com | Falls back to the last stored minute with a "pipeline paused" label. |

## Kafka design

| Topic | Partitions | Key | Retention | Consumers |
|---|---|---|---|---|
| `wiki.edits.raw` | 6 | wiki (e.g. `enwiki`) | 24h | wiki-enrich |
| `wiki.edits.enriched` | 6 | wiki | 24h | wiki-aggregate, wiki-sink |
| `wiki.trends` | 1 | page | 24h | wiki-sink |
| `wiki.edits.dlq` | 1 | none | 72h | inspected by hand; counted on the page |

- **Keys by wiki** keep each wiki's edits in order on one partition; a partition's ordering is visible in the feed.
- **Delivery:** at-least-once. Consumers commit offsets after the downstream write succeeds; the sink upserts by event id, so a replay never double-counts. Exactly-once is discussed, not claimed.
- **Resume:** the producer stores the last Wikimedia event id in Supabase and reconnects from it; each consumer group resumes from its committed offsets.

## Schema (`wiki_stream`)

```
Live        feed_frames (1 per second: sampled edits + counters) · trending
Metrics     metrics_10s (edits, bytes, bots, languages per 10-second window)
Telemetry   stage_runs (stage, run, events in/out, errors, CPU ms, duration)
            consumer_lag (group, partition, lag, sampled each run) · source_offsets
Alerts      alerts (freshness, lag, DLQ rate, producer errors)
```

Own schema, own write role (`wikistream_pipeline`) and a read-only role for the page, like `cx_eval`.

## Retention

| Data | Kept | Mechanism |
|---|---|---|
| `feed_frames` | last 30 minutes | `pg_cron` delete every 5 minutes |
| `metrics_10s`, `consumer_lag`, `stage_runs` | last 24 hours | `pg_cron` delete every 5 minutes |
| `trending` | last 7 days | `pg_cron` daily |
| Kafka topics | 24h (DLQ 72h) | topic retention config |

Expected Supabase footprint: tens of MB at most (to confirm in stage 0 from measured event sizes).

## The page

1. **Live feed:** edits scroll in like a live chat: flag, language, page title, size change, bot or human, with trending pages pinned as "🔥 breaking" cards.
2. **Right now:** edits per second (sparkline), bots vs. humans, top languages, bytes added.
3. **Pipeline, live:** the architecture diagram with real counters on each stage and topic: events in and out, DLQ count, consumer lag per partition, end-to-end latency p50/p95 (Wikipedia event time → visible in the browser).
4. **How it works:** stage cards with the code that runs (tabs), the Kafka concepts each stage demonstrates, and the measured limits of the free tiers.
5. **Honest status:** if the pipeline is paused (e.g. the free Kafka service powered off), the page says so and shows the last stored minute.

## Stages

| # | Stage | Builds | Status |
|---|---|---|---|
| 0 | **Spike and profile:** measure the stream; prove Edge Functions can reach Aiven Kafka within the CPU budget | profiling numbers in this plan; go / fallback decision | ⬜ |
| 1 | **Ingest:** SSE producer, event contract, DLQ, resume from last event id | producer, contract, `source_offsets` | ⬜ |
| 2 | **Enrich:** consumer group, enrichment, content filter | `wiki.edits.enriched` | ⬜ |
| 3 | **Aggregate:** 10-second windows and trending detector | `wiki.trends`, window logic with tests | ⬜ |
| 4 | **Sink and retention:** idempotent writes, frames, `pg_cron` cleanup | migration, sink, retention jobs | ⬜ |
| 5 | **Monitor:** lag sampling, freshness and DLQ checks, alerts | `consumer_lag`, `alerts`, checks | ⬜ |
| 6 | **Page:** live feed, charts, live pipeline diagram, code tabs | `/projects/wiki-stream`, project card | ⬜ |
| 7 | **Write-up:** what broke, what was measured, free-tier limits | project write-up | ⬜ |

## Concept coverage

| Streaming concept | Where it shows |
|---|---|
| Producers, topics, partitions, keys and ordering | Stages 1, 2 |
| Consumer groups and committed offsets | Stages 2–4 |
| At-least-once delivery with idempotent sinks | Stage 4 |
| Schema contracts and dead-letter queues | Stage 1 |
| Stateless (enrich) vs. stateful (windowed) processing | Stages 2, 3 |
| Backpressure, lag and freshness monitoring | Stage 5 |
| Retention at the broker and in storage | Stage 4 |
| Exactly-once and stream joins | Discussed in the write-up, not built |

**Simulated:** nothing. The data, broker and consumers are real; the only difference from production streaming is that workers restart every minute instead of running forever, and the page shows the resulting latency honestly.

## Open questions (stage 0)

1. Can Supabase Edge Functions open Kafka (TLS over TCP) connections to Aiven, and does a ~55 s run stay within the free CPU budget?
2. Exact Aiven free-tier limits: throughput, partitions, retention, idle power-off behaviour.
3. Supabase Realtime free-tier quotas, to size the frame rate.

## Configuration (planned)

| Variable | Used by | Purpose |
|---|---|---|
| `KAFKA_BROKERS`, `KAFKA_CA`, `KAFKA_USERNAME`, `KAFKA_PASSWORD` | workers | Aiven Kafka connection (SASL/SCRAM over TLS) |
| `SUPABASE_DB_URL` | migrations | Admin connection |
| `WIKISTREAM_DATABASE_URL` | workers | Pipeline write role |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | page | Realtime subscription to frames (read-only) |
