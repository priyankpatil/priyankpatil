# Deploy Wikipedia Live

The website stays on the existing Vercel project. Kafka stays on the existing Aiven
service. The ingestion/enrichment/display processes run together in one container.
No new database or Kafka service is needed.

## Website on Vercel

1. Sign in locally with `vercel login` and link the existing portfolio project.
2. Add `WIKISTREAM_READ_URL` from `.env.local` to the intended Vercel environment.
   The bundled public Supabase root CA enables verified TLS; a project-specific
   `WIKISTREAM_DATABASE_CA` override is optional.
3. Deploy the feature branch as a preview, check `/projects/wiki-stream` and
   `/api/wiki-stream`, then deploy production when the change is ready.

The website needs **only the reader connection**. It must not receive the Kafka
private key, pipeline-role connection, or Supabase admin connection. Environment
values are secrets and must go through stdin or the hosting dashboard, never CLI
arguments, logs or Git.

## Prepare the worker settings

From the repo root:

```sh
npm run wiki:export-worker
```

This generates `pipelines/wiki-stream/.secrets/worker.env`, ignored by Git with
owner-only permissions. It includes only the required worker settings. Certificate
file references become inline PEM with escaped newlines, so the container does not
need your laptop's paths. The application decodes those newlines at startup.

Do not upload the project's `.env` or `.env.local`: those contain credentials for
other applications. Do not paste `worker.env` in chat, an issue or a PR.

## Free cloud demonstration: Render web service

Render offers free web-service instances; its background-worker service has no free
instance. The same worker container therefore exposes `/health` on `PORT`. Deploy
it as a **Web Service**, not a Background Worker.

1. Create/connect your Render account and select **New → Web Service**.
2. Connect `priyankpatil/priyankpatil` and select the branch containing this change.
3. Select **Docker**, repository root as context, and
   `pipelines/wiki-stream/Dockerfile` as the Dockerfile path.
4. Explicitly choose the **Free** instance. Set health-check path `/health`.
5. Use the settings from `worker.env` for the service environment. Render's env-file
   import can be used when available. If entering certificate values manually, use
   the full PEM contents or their literal `\n` representation; both are accepted.
6. Deploy. Check logs for `[source] connected` and `[sink] events=...`.
7. Open `/health` on the service URL. After startup, each of the three stages should
   have a recent timestamp. The response contains no credentials.
8. Open the Vercel project page. It should switch to **Live from the pipeline**.

A blueprint is also provided at `pipelines/wiki-stream/render.yaml`; use that path
when creating a Blueprint instead of the manual steps. Review its plan before
creation. It explicitly selects the free web instance and disables automatic
redeploys; secret values are entered during setup.

**Free instance behavior:** Render spins a free web service down after 15 minutes
without inbound traffic. Outbound Kafka traffic does not guarantee it stays awake.
This is a free demonstration deployment, not an always-on SLA. Opening its URL wakes
it; startup may take time. The website now attempts one wake request when a visible,
unpaused visit encounters a stale feed. A “Start live feed” control supports manual
retry. Requests go through the rate-limited Vercel POST endpoint
`/api/wiki-stream/wake` to the fixed public Render health URL; no Render API key or
deploy hook is needed. Feed polling continues during startup and switches to fresh
data automatically. No cron or continuous health-ping loop is used. This wakes an
idle service; it does not force-restart or redeploy an unhealthy service. The frontend
labels old frames and provides recorded events while the worker is asleep. Do not promise continuous live
updates or add artificial keep-alive traffic to disguise the sleeping behavior.

Free service outbound bandwidth and build allowances are separate from Aiven and
Supabase quotas. Monitor the host's dashboard as well as `npm run wiki:health`.
For continuous operation, move the same container to an already-owned always-on
host or explicitly choose a paid worker after deciding a budget.

Sources: https://render.com/docs/free and https://render.com/docs/blueprint-spec.

## Any existing container host

```sh
docker build -f pipelines/wiki-stream/Dockerfile -t wiki-stream-worker .
docker run --init --restart unless-stopped \
  --env-file pipelines/wiki-stream/.secrets/worker.env \
  -p 8080:8080 wiki-stream-worker
```

The image uses Node 22 and runs as the unprivileged `node` user. Give it at least
512 MiB RAM initially and measure actual use. It needs outbound connectivity to
Wikimedia HTTPS, the configured Kafka TLS port, and Supabase Postgres. There is no
persistent local disk. Use one instance, with a shutdown grace period of at least
20 seconds. More display replicas need a concurrency redesign: the aggregate state
uses a compare-and-swap revision to prevent conflicting writers.

## Post-deployment checks

```sh
npm run wiki:health -- --kafka
npm run wiki:verify
```

Verify fresh frames, real partition/offset metadata, no persistent consumer lag,
frame size <=4 KiB, <=120 feed slots, <=1,440 minute-summary slots, and schema size
comfortably below 30 MiB. `wiki:verify -- --capture` intentionally replaces the
checked-in Kafka recording and verification report.

For recovery, stop/restart the worker once. Counters and offsets should resume from
the persisted state; recent duplicate IDs should not inflate unique event totals.
After a long idle (over 15 minutes without accepted display data), the source
explicitly resumes the last 60 seconds and logs the omitted upstream history.
Short interruptions resume their saved cursor. The page totals cover admitted
capture windows; recovery is not claimed to be gap-free across sleeping periods.
