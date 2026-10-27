# Wikipedia Live — implementation status

This implements the Wikipedia/Kafka direction discussed in the remote draft plan,
with the current Aiven free-tier constraints and a smaller Supabase serving layer.

## Decisions

- Cloud Kafka: Aiven, three topics with two partitions each. No local broker.
- Compute: one deployable Node 22 container with a source process and two consumer processes. Worker container and free Render blueprint are ready; deployment requires the user's worker-host account.
- Source: Wikipedia article edits only from Wikimedia EventStreams. Drop other Wikimedia projects, talk/log events, canaries, usernames and summaries.
- Display: sampled edits animated in the browser, language counts, bounded editing-burst candidates and source/Kafka tracing.
- Delivery: cached five-second API responses, avoiding Supabase Realtime message usage.
- Storage: 120 feed slots, 1,440 minute-summary slots, one bounded aggregate state and source cursor. No full edit history.
- Resource controls: 30 MiB wiki schema cutoff, 400 MiB database cutoff, conservative 512 MiB monthly database-response budget. Monitor actual platform usage separately.

## Source spike (2026-10-27)

20-second capture: 2,720 upstream events, 97 accepted Wikipedia article edits,
4.83 accepted edits/s, mean projected event 192 bytes, about 926 projected bytes/s,
36.1% bot edits and no contract errors. This is a short sample, not capacity planning
for peaks. The first 40 projected edits are saved as an attributed recorded preview.
That original source sample has not traversed Kafka. The frontend now uses a separate actual Kafka recording in `lib/wiki-stream/recorded.json`. Original source report: `lib/wiki-stream/preview.json`.

Existing database usage before initialization was approximately 125 MB. The live run now verifies both groups, resource caps and real offsets. `verification.json` records measured counts, lag, latency and recovery results; longer-run monitoring remains an operational task.

## Stages

| Stage | Status |
|---|---|
| Source spike and safe recorded preview | Complete |
| Aiven TLS config + topic initialization command | Connected; three two-partition topics created |
| Producer + checkpoints + rejection handling | Verified against live Aiven and Supabase |
| Enrichment consumer + independent offsets | Verified against live Aiven and Supabase |
| Bounded state, counters, windows and display consumer | Verified against live Aiven and Supabase |
| Supabase schema, dedicated roles and budget/permission checks | Initialized and checked |
| Frontend and cached read API | Live API and recorded Kafka replay implemented; HTTP/build checks pass; browser visual QA unavailable |
| Always-on worker host | Container, health endpoint, minimal secret export and free Render deployment guide ready; account deployment pending |
| Failure/recovery exercise and longer-run profiling | Recovery/counters and cloud resource caps checked; ongoing monitoring remains |
| Isolated replay demonstration | Complete: isolated browser replay with real per-partition offsets; live groups unaffected |

Setup and precise guarantees/limitations are in [README.md](README.md).

## Recovery and resource behavior

Both partitions coalesce into one atomic snapshot every five seconds. Heartbeats continue while network/database calls wait. Source IDs are deduplicated within a bounded 1,000-ID window. After a long source idle, only the recent source window is resumed and the historical gap is explicitly omitted. The aggregate byte cap prunes candidate detail before exceeding the row budget; fixed slot counts alone would not bound multilingual title sizes.
