# Wikipedia Live

Wikimedia EventStreams → **Aiven Apache Kafka** → enrichment consumer → display/analytics consumer → bounded Supabase tables → cached Next.js API → animated edit feed at `/projects/wiki-stream`.

## Current behavior

The page works immediately using an explicitly labelled recording of the real Kafka pipeline, including measured timestamps and partition offsets. The original Wikimedia-only source spike is retained separately in `preview.json`. Live mode starts only when the worker writes fresh frames and the site has its dedicated read connection. After 30 seconds without a fresh frame the page labels the data as stale. Pausing the display or hiding the tab stops polling. Resuming fetches the newest sampled frame; it does not replay all missed edits.

## 1. Configure Aiven

Use the service **Overview → Connection information**. Add values to ignored `.env.local` (not chat, Git, or a screenshot):

```dotenv
KAFKA_BROKERS=your-service-host:your-port
KAFKA_CA=/absolute/path/to/ca.pem
KAFKA_CERT=/absolute/path/to/service.cert
KAFKA_KEY=/absolute/path/to/service.key
WIKISTREAM_USER_AGENT=PriyankPatilWikiStream/0.1 (https://github.com/priyankpatil/priyankpatil)
```

Aiven usually provides certificate authentication. Download the service CA and user certificate/key into `pipelines/wiki-stream/.secrets/` (ignored). Each TLS setting also accepts literal PEM. If using SASL, enable it in Aiven and set `KAFKA_USERNAME`, `KAFKA_PASSWORD`, and its **SASL-specific port** instead of the client certificate/key. This client uses SCRAM-SHA-256. TLS verification stays enabled. Supabase connections include its public Root 2021 CA by default; an environment override can supply a rotated or custom CA.

Run `npm run wiki:topics` to create exactly three topics, each with two partitions:

| Topic | Content | Consumer group |
|---|---|---|
| `wiki.edits.raw` | Small, projected article edits, keyed by wiki + title | `wiki-enrich-v1` |
| `wiki.edits.enriched` | Adds language, byte delta and enrichment timestamp | `wiki-display-v1` |
| `wiki.edits.dlq` | Rejection reason, payload hash and source position; no original payload | Manual investigation |

The setup script does not override Aiven's fixed free-tier retention settings. Check the actual plan/console before depending on a replay horizon. Topic creation may require a user with admin permissions. Do not delete/recreate topics with the same names while retaining sink checkpoints: offsets would no longer describe the same log.

## 2. Initialize bounded Supabase storage

The existing admin `SUPABASE_DB_URL` is used **only for initialization**:

```sh
npm run wiki:db:check  # create schema, test isolation/budgets, ROLLBACK
npm run wiki:db:apply  # initialize absent schema + dedicated role credentials
```

Apply saves new `WIKISTREAM_DATABASE_URL` and `WIKISTREAM_READ_URL` values to ignored `.env.local`, without printing passwords. It does not rerun migrations or rotate credentials when the schema exists. These roles can execute only this project's allowlisted functions; the site cannot read pipeline state or write data. Do not put the admin connection on the worker host or the web deployment. If your Supabase certificate requires a custom CA, set `WIKISTREAM_DATABASE_CA` (PEM in the website environment; PEM or file path in the worker).

| Stored data | Bound |
|---|---|
| Feed frames | 120 fixed slots, one write per ≥5 seconds, ~10-minute ring; wire frame ≤4 KiB |
| Minute summaries | 1,440 fixed slots, ~24-hour ring |
| Aggregate/checkpoint state | One row ≤192 KiB; last 1,000 IDs, 60 minute buckets, ≤150 page candidates |
| Source cursor | One row ≤16 KiB |
| Read usage | One row, resets at UTC calendar month boundary |

There is no full edit history, article text, username/IP data, image storage, or per-event SQL log. Raw/ enriched events stay in Kafka under broker retention. Feed batches may contain fewer than ten edits because the byte cap wins. Page candidate tracking is intentionally bounded and not an exhaustive global trend ranking.

The sink deletes expired frames/summaries on writes. Fixed slots still bound row counts if cleanup is delayed or the worker stops. Stale rows then remain physically present, bounded, until the worker resumes. State and frame tables have aggressive autovacuum settings; physical allocation (including indexes and TOAST) is measured separately from live row bytes.

Defaults in `wiki_stream.settings`:

- **30 MiB** schema cutoff and **400 MiB** whole-database cutoff stop the sink *before* committing Kafka offsets. They are conservative cutoffs, not exact reservations; other applications can still use the same database.
- **512 MiB/month** conservative read-response allowance, reserving 16 KiB per database read (above the stored frame size). This is not Supabase's billing meter and excludes other projects, connection overhead and platform traffic. Empty/budget-denied responses are small but still incur network traffic.
- **Five-second Next.js cache** shares database reads; edge response caching further reduces fan-out. This version uses no Supabase Realtime messages. Website/API hosting bandwidth has its own limits.

Use `npm run wiki:health` for storage and reserved-read usage; `npm run wiki:health -- --kafka` also checks broker metadata. Monitor actual Supabase database size and egress in its dashboard. Admins can disable reads/writes with `update wiki_stream.settings set enabled=false where id;`. Existing in-flight/cached responses can persist briefly. No public control mutates budgets.

## 3. Start the worker

```sh
npm run wiki:worker
```

This launches the source producer plus two Kafka consumers. The producer checkpoints only after broker acknowledgement. Short interruptions resume that cursor. After more than 15 minutes without accepted display data, startup explicitly resumes the last 60 seconds of the source and logs that older upstream history is omitted; totals cover accepted capture windows, not uninterrupted historical coverage. Enrichment commits offsets only after output acknowledgement. The sink coalesces both partitions into one snapshot every five seconds, saves bounded aggregate state and consumed offsets atomically, then commits Kafka offsets. Heartbeats continue while broker/database I/O waits. Replayed offsets are ignored; recent duplicate source IDs are also suppressed. Source-ID deduplication is limited to the last 1,000 admitted IDs, so this is **at-least-once with bounded deduplication**, not end-to-end exactly-once processing.

Minute windows use source event time, accepting the current and previous minute buckets. Older events count in lifetime totals and the late counter but not live windows/feed. Burst detection compares two adjacent five-minute bucket windows. The frame lag field sums the buffered batches' partition watermarks, not independently sampled global consumer-group lag. `wiki:verify` separately reads broker heads and group commits across both partitions. Latency is source-to-storage for the latest sampled edit, includes source delay, and is not browser end-to-end latency.

Invalid source/raw contracts go to the DLQ; source rejects are limited to ten reports per minute. Invalid enriched events fail the sink closed for investigation. Resource budget exceptions also stop the sink without advancing offsets; restarting cannot bypass the budget. Resetting aggregate state intentionally resets the displayed lifetime counters.

### Cloud container

No local Kafka installation is needed. From the repo root:

```sh
docker build -f pipelines/wiki-stream/Dockerfile -t wiki-stream-worker .
docker run --init --env-file /secure/path/worker.env \
  -v /secure/path/certs:/certs:ro wiki-stream-worker
```

Run `npm run wiki:export-worker` to create a minimal, ignored, Docker-compatible `.secrets/worker.env` with inline certificates, or create an equivalent file with mounted `/certs/...` paths. Do not include the admin or reader URL. The host should run one container, restart on failure, and send SIGTERM with a 20-second shutdown grace period. It needs outbound TLS connectivity to Wikimedia, Aiven, and Supabase. When `PORT` is set, `/health` reports recent heartbeats for all three stages. See [the deployment guide](DEPLOY.md), including a free Render web-service option that sleeps when idle. Always-on worker hosting is separate from the free Kafka broker.

For the existing Vercel site, configure **only** `WIKISTREAM_READ_URL` and optional database CA, then redeploy when ready. No Kafka credentials belong on the website. `.dockerignore` prevents local environment files/certificates and unrelated data from entering the build context.

## Development and checks

```sh
npm run wiki:profile -- --seconds 30
npm run wiki:test
npm run lint
npm run typecheck
npm run build
```

`wiki:profile -- --seconds 20 --save-preview` intentionally replaces the checked-in source sample and its profiling report. Samples contain only projected article metadata, never editor identities or free-text summaries. Tests cover source contracts, SSE parsing, replay/deduplication, late-event windows, candidate expiration and byte/cardinality caps. `wiki:db:check` checks the actual SQL functions/roles/budgets against the configured Supabase project in a rolled-back transaction before the first apply.

## Next increment

- Deploy the provided worker container using [DEPLOY.md](DEPLOY.md); no worker host account was available in this session.
- Monitor full-broker ingress/egress and p50/p95 latency over a longer run.
- The page keeps recent edit activity below the live dashboard. Recorded Kafka events provide labelled fallback playback when the live pipeline is offline.

Sources: [Wikimedia EventStreams](https://wikitech.wikimedia.org/wiki/EventStreams), [Aiven free Kafka](https://aiven.io/docs/products/kafka/free-tier/kafka-free-tier), [Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

## Verified live run

`verification.json` records a real cloud run: both consumer groups, real offsets, bounded frames/state and actual storage usage. `npm run wiki:verify -- --capture` refreshes it and the recorded Kafka sample. `npm run wiki:test` includes partition coalescing, failed-persistence acknowledgement isolation, replay cursors, long-idle resume policy and worst-case multilingual state sizes. Recorded fallback playback runs in the browser and consumes no extra Supabase queries.
