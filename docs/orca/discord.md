# Discord alerts

## Delivery and destinations

One discordDelivery component serializes every destination. Each accepted group finishes,
fails or expires before another begins. Full payloads, HTTP results and unsent records are
retained. Requirements and queue semantics live in packages/discord-delivery/REQUIREMENTS.md
and packages/discord-delivery/ARCHITECTURE.md; ORCA producer policy lives in
docs/orca/alerts-expansion.md.

Register a webhook URL as a destination, then configure its automatic ORCA route. Run
these internal operators from packages/backend with an explicit deployment:

```sh
bun run convex run alerts/discord/destinations:register '{"key":"dev","url":"<webhook-url>"}' --deployment <deployment>
bun run convex run alerts/discord/destinations:configureRoute '{"destinationKey":"dev","enabled":true,"maxAgeMs":3600000}' --deployment <deployment>
```

`ORCA_DISCORD_AUTO_SEND_ENABLED=true` admits automatic preparation with event commits.
The route's age is measured from `scan_at`, so old backfill is recorded and expires.
The switch governs admission; use `alerts/discord/outbox:pause` with `{"paused":true}`
to pause accepted delivery. In-flight HTTP can finish. Resume with `{"paused":false}`.

Preparation errors remain in `discord_alert_preparations`. Inspect with
`alerts/discord/delivery:preparations`, then invoke `:retryPreparation` with its
`preparationId` after fixing the cause. An empty route snapshot can be populated during
explicit recovery. Preparation enqueues all selected destinations transactionally.

## Iterating on alerts in development

Use a scan already ingested by the development deployment and registered development
Discord destinations. Each invocation rerenders the complete scan with current filtering,
batching, ordering, and cards, then submits fresh groups through the shared sender.

From `packages/backend`:

```sh
bun run convex run alerts/discord/delivery:demoScan '{"scan_at":"2026-10-07T03:00:00.000Z","destinationKeys":["orca-dev-3","orca-dev-4"]}' --deployment <dev-deployment>
```

Rerun the same command after pushing rendering changes to that development deployment.
Delivery starts now with no expiry; card timestamps and pricing-frequency lookbacks retain
the original observation time. Every invocation intentionally sends another copy, including
identical output. The result contains queued group IDs, message counts, and skipped events;
delivery is asynchronous. Inspect those groups with `alerts/discord/outbox:group`.

Automatic admission and preparation records are bypassed. Previous runs and Discord
messages are retained. Run this internal operator only against development deployments
and destinations; production alert state is not reset or edited for development.

`alerts/discord/delivery:preview` accepts `{"event_ids":["…"]}` for a query-only rendering
of selected events. Oversized scans fail rather than submitting a partial selection.
Normal sender payload and group limits still apply; limits are recorded in docs/orca/config.md.

## Investigating output

Convert the user's time window and timezone to epoch milliseconds. Query receipts for
when HTTP responses were recorded, or groups for intended send time; historical work can
make these windows very different.

```sh
bun run convex run alerts/discord/outbox:inspectReceipts '{"from":<start-ms>,"to":<end-ms>,"paginationOpts":{"numItems":50,"cursor":null}}' --deployment <deployment>
bun run convex run alerts/discord/outbox:message '{"messageId":"<result.messageId>"}' --deployment <deployment>
bun run convex run alerts/discord/outbox:inspectGroups '{"from":<start-ms>,"to":<end-ms>,"paginationOpts":{"numItems":50,"cursor":null}}' --deployment <deployment>
```

Follow `continueCursor` until `isDone`; filtered pages can be empty. The message query
returns the frozen payload and latest result. `inspectMessages` pages a group or caller
message key. `inspectAttempts` uses claim/schedule time and shows uncertain recovery and
retries. `inspectGroups` accepts destination, key and status filters to find failed or
expired work with no HTTP result. Preparation records also retain ineligible/frequent-price
skip reasons. A current preview is useful for comparison, not evidence of an old send.

All wrappers are internal. Trusted CLI operators can run them against an explicitly
selected deployment. Convex MCP read-only data/one-off query access requires its production
read setting; the general `run` tool also permits mutations and requires broader access.
The installed Convex 1.45 MCP data tool does not select child components. Use the
internal query wrappers through the trusted CLI, or inspect the component directly with
the CLI's read-only data command:

```sh
bun run convex data results --component discordDelivery --limit 100 --format json --deployment <deployment>
```

This does not run the renderer or a send action. The wrappers provide indexed time windows
and pagination instead of scanning raw records.

## Message management and demonstration

`alerts/discord/outbox:manage` accepts `{messageId,operation,key,sendAt?,payload?}`.
Operations are `get`, `edit` and `delete`; edits require serialized `payload`. Supply the
component's original message ID, rather than a Discord snowflake. The saved receipt and
URL locate the remote message. Management creates a new queued group and retains the
original send. Discord's unknown-message response to DELETE counts as an already-completed
delete; an unknown-message GET remains a failed lookup.

The reproducible development demonstration is:

```sh
bun packages/scripts/discord-demo.ts <dev-deployment> orca-dev-3 orca-dev-4
```

Register those development destinations first. This sends ordered text/V2 groups, exercises
an invalid payload and one-hop terminal report, edits/fetches/deletes a demo message, and
writes docs/orca/discord-demo.json with the selected population and receipt IDs. The archive
retains deleted-message evidence. Run only against destinations intended for testing.

## Presentation

Apply shared [alert eligibility](pricing.md#alert-eligibility), then the frequency
rule below, before grouping identical changes. Monitor and Feed remain unbatched;
query pages do not define meaningful batch membership.

Only model discoveries receive introductory cards. Known arrivals describe renewed
availability; unclassified arrivals use neutral language. See [event meaning](events.md).
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
