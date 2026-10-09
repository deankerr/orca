# Discord alerts

One webhook per deployment. Dev/preview share a private development channel;
production has its own destination.

## Delivery

Disable `ORCA_DISCORD_AUTO_SEND_ENABLED` before historical replay or catch-up;
automatic delivery has no age cutoff. Queued batches check the switch when starting.
Running batches continue independently. Re-enable it when ingestion is current.

Fresh event commits trigger best-effort delivery. Processor retries never broadcast.
A scheduling failure can lose a broadcast after its events have committed. Delivery
has no automatic retry or deduplication; a failed send abandons the rest of its batch.
Batches may interleave, so a missing message does not prove ingestion failed.

## Manual delivery

These internal functions bypass the switch and can duplicate messages. Run from
`packages/backend` with an explicit deployment:

| Function                               | Arguments              |
| -------------------------------------- | ---------------------- |
| `alerts/discord/delivery:send`         | `{"event_id":"…"}`     |
| `alerts/discord/delivery:sendExamples` | `{"event_ids":["…"]}`  |
| `alerts/discord/delivery:sendLatest`   | `{}` or `{"limit":15}` |

## Presentation

Apply shared alert eligibility, then the frequency
rule below, before grouping identical changes. Monitor and Feed remain unbatched;
query pages do not define meaningful batch membership.

Only model discoveries receive introductory cards. Known arrivals describe renewed
availability; unclassified arrivals use neutral language.
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
