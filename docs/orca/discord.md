# Discord alerts

## Admission and routing

`ORCA_DISCORD_AUTO_SEND_ENABLED=true` schedules alert preparation after fresh
ingestion events have committed. Preparation renders the events and submits once
to the sender's `ingestion` topic; each eligible subscriber receives the same
ordered batch.

Preparation failures leave committed events intact. Scheduling from the ingestion
action is best-effort: a failure between event commit and scheduling can leave
alerts unqueued. Inspect scheduling/preparation failures in logs and use
`sendIngestion` for an intentional send after fixing the cause.
Event-only `retry:events` recovery does not broadcast alerts.

The switch is checked before scheduling and again when preparation starts. Already
submitted sender jobs continue independently. No eligible messages or matching
webhooks produces no jobs.

The submission key is `ingestion:<scan_at>`. Historical backfill can submit jobs
that expire before sending; the age policy lives in docs/orca/config.md. Webhook
management and delivery contracts live in packages/discord-sender/README.md.

## Registration

Each deployment needs an eligible webhook subscribed to `ingestion` before alerts
can produce delivery jobs. Webhook URLs and subscriptions live in the component.
Run operator commands from `packages/backend`, selecting the deployment explicitly.

```sh
bunx convex run api:registerWebhook '{"name":"Ingestion alerts","topics":["ingestion"],"url":"<webhook-url>"}' --component discordSender --deployment <deployment>
bunx convex run api:listWebhooks '{}' --component discordSender --deployment <deployment>
```

For development, use the worktree's deployment and private development webhooks.

## Prepare and send an ingestion

To prepare one completed ingestion with current filtering and card rendering,
without enqueueing or sending anything:

```sh
bunx convex run alerts/discord/delivery:prepareIngestion '{"ingestion_id":"<ingestion-id>"}' --deployment <deployment>
```

The query returns `scan_at`, ordered `messages` (each with a stable `key`,
serialized JSON `payload`, and source `event_ids`), and `skippedEvents` with
filtering reasons. It uses current rendering and available history, regardless of
auto-send, observation age or registered webhooks.

To manually send that ingestion:

```sh
bunx convex run alerts/discord/delivery:sendIngestion '{"ingestion_id":"<ingestion-id>"}' --deployment <deployment>
```

Each invocation intentionally sends again to eligible `ingestion` subscribers,
with a fresh deadline based on the configured age limit. Cards and filtering
retain the original observation time. The command works with auto-send disabled
and returns `jobIds` and `messageCount`; a positive count with no jobs means there
were rendered messages but no eligible subscribers. Both operator commands require
completed event processing.

## Inspect delivered output

To investigate output, convert the requested time window and timezone to epoch
milliseconds. `listJobs` uses submission time, which can differ from the source's
`scan_at`; job keys retain that observation time.

```sh
bunx convex run api:listJobs '{"from":<start-ms>,"to":<end-ms>}' --component discordSender --deployment <deployment>
bunx convex run api:getJob '{"jobId":"<job-id>"}' --component discordSender --deployment <deployment>
bunx convex run api:listResults '{"jobId":"<job-id>"}' --component discordSender --deployment <deployment>
```

If `hasMore` is true, narrow the discovery window. Use stored jobs and results for
historical evidence; `prepareIngestion` rerenders with current code and history.

## Presentation

Apply shared alert eligibility from docs/orca/pricing.md, then the frequency
rule below, before grouping identical changes. Monitor and Feed remain unbatched;
query pages do not define meaningful batch membership.

Only model discoveries receive introductory cards. Known arrivals describe renewed
availability; unclassified arrivals use neutral language. Event meaning is documented in docs/orca/events.md.
Provider alerts cover identity, locations, status, and terms/privacy URLs.

## Frequent pricing changes

Discord suppresses ordinary pricing fields after **two prior quote entries within
24 hours**. These defaults are calibrated below; the constants live in
`alerts/discord/frequency.ts`. Lifecycle alerts and schedule-definition changes bypass
this rule. Other selected changes remain visible.

The count measures observed quotes, including small changes and relistings, rather
than delivered alerts. It excludes the event itself and later observations so replay
uses the same rule as live delivery. Missing or backfilled history can change the
result. Large movements receive no exception: repeated updates are the problem.
Monitor, Feed, Events, and Pricing History retain their own behavior.

### Initial calibration

Replaying the hourly captures from September 26–October 3, 2026, reserving the first 24 hours for
lookback, produced 1,507 eligible endpoint pricing alerts over the remaining six days. These are
alerts before Discord grouping, not message counts:

| Window   | Prior quote threshold | Alerts remaining |
| -------- | --------------------- | ---------------- |
| 6 hours  | 2                     | 708              |
| 12 hours | 2                     | 505              |
| 24 hours | 3                     | 445              |
| 24 hours | 2                     | 314              |

The initial 24-hour/two-quote policy removes 79% of these alerts while forgetting bursts much
sooner than a week-long window. It does not attempt to identify unofficial discount schedules.
Retaining the cheap magnitude gates avoids another 191 history candidates and 23 surviving
small-change alerts in this sample. These defaults are an empirical starting point, not a
guarantee of a fixed alert rate; sparse recurring changes can still pass.
