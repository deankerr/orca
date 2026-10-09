# Discord alerts

## Admission and routing

`ORCA_DISCORD_AUTO_SEND_ENABLED=true` submits alerts with fresh ingestion event
commits. Every registered `discordSender` webhook receives the same ordered batch.
Registering a webhook therefore opts it into all automatic ingestion alerts;
subscription and destination-management policy remain future work.

Rendering and job submission share the event commit transaction. If either fails,
the event commit rolls back and processor work remains pending. After fixing the
cause, use the existing `retry:events` operator action to retry that work; preparation
failures are not retried automatically. With no registered webhooks or no eligible
messages, the commit proceeds without a send job.
The switch controls admission; already submitted jobs continue running.

Job keys contain the observation's `scan_at` and webhook ID. Deadlines derive from
that observation time, so historical backfill can submit jobs which expire before
sending. The age policy lives in docs/orca/config.md. Sender ordering, retries,
expiry and recovery semantics live in packages/discord-sender/README.md.

## Registration and inspection

Use the component API directly from packages/backend, selecting the deployment
explicitly. Registration changes the recipients of subsequent ingestions.

```sh
bunx convex run api:registerWebhook '{"name":"Development","url":"<webhook-url>"}' --component discordSender --deployment <deployment>
bunx convex run api:listWebhooks '{}' --component discordSender --deployment <deployment>
```

For development, use the worktree's deployment and private development webhooks.
The same ingestion path exercises filtering, batching, cards and delivery. Sender
`api:submitBatch` accepts custom ordered payloads for focused delivery exercises;
use a fresh key and deadline for each intentional repeat.

To manually send one completed ingestion with current card rendering:

```sh
bunx convex run alerts/discord/delivery:sendIngestion '{"ingestion_id":"<ingestion-id>"}' --deployment <dev-deployment>
```

This explicit operator command works with auto-send disabled and uses all registered
webhooks. Each invocation creates fresh jobs with a one-hour deadline from now,
while cards and filtering retain the original observation time. Repeating the
command intentionally sends again without changing earlier jobs or ingestion work.
It returns `jobIds` and the message count per destination; zero destinations or
fully filtered output produces no jobs. Event processing must be complete.

To investigate output, convert the requested time window and timezone to epoch
milliseconds. `listJobs` uses submission time, which can differ from the source's
`scan_at`; job keys retain that observation time.

```sh
bunx convex run api:listJobs '{"from":<start-ms>,"to":<end-ms>}' --component discordSender --deployment <deployment>
bunx convex run api:getJob '{"jobId":"<job-id>"}' --component discordSender --deployment <deployment>
bunx convex run api:listResults '{"jobId":"<job-id>"}' --component discordSender --deployment <deployment>
```

If `hasMore` is true, narrow the discovery window. Jobs preserve the submitted
payloads; results preserve terminal Discord responses. A finished job's missing
results represent its unsent suffix. Transient errors remain in logs. These queries
inspect stored evidence without rerendering cards or sending messages.

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
