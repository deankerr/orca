# Discord alerts

Discord alerts are a production product, delivered to one webhook target. Delivery is best-effort,
with the failure behavior described below.

## Environment variables

Convex project defaults already configure Discord for dev and preview deployments; no manual setup
is needed. All dev and preview webhooks point to the same private development channel. Only production
has the production webhook URL, so development alerts stay out of the production channel.

| Variable                      | Purpose and defaults                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ORCA_DISCORD_ALERTS_ENABLED` | Enables automatic scheduling and queued batch starts only for the exact string `true`. The project default is `false`; individual deployments can override it. Production is enabled. |
| `ORCA_DISCORD_WEBHOOK_URL`    | Destination for live and manual alerts. Defaults to the shared private dev channel; production overrides it with the production channel webhook.                                      |
| `ORCA_PUBLIC_URL`             | Web app base URL for links in cards, supplied by project defaults.                                                                                                                    |
| `ENTITY_LOGO_SERVICE_ORIGIN`  | Public logo-service origin for card images, supplied by project defaults.                                                                                                             |

The alert switch is independent of scan capture and scheduled ingestion. Manual delivery bypasses
it and can still post when it is unset or `false`.

## Live controls

Disable `ORCA_DISCORD_ALERTS_ENABLED` before historical replay or ingestion catch-up; there is no
automatic age cutoff. Queued batches check the switch on entry; running batches finish or fail
independently. Re-enable it when ingestion is current.

Fresh routine event commits schedule one single-attempt batch. Manual processor retries never
broadcast. Completed or empty commits provide no IDs to send. A scheduling failure after event
commit loses the broadcast without undoing the events or stopping subsequent ingestion.

There is no outbox, delivery ledger, automatic retry, or deduplication. Messages are paced two
seconds apart within a batch, but batches can overlap and interleave. HTTP errors (including 429),
render failures, or action timeouts abandon the remaining batch. A missing message does not
establish an event-processing failure.

## Manual delivery

Run from `packages/backend` with an explicit deployment. These tools bypass the live broadcast switch
and can duplicate messages:

| Function                               | Arguments                                               |
| -------------------------------------- | ------------------------------------------------------- |
| `alerts/discord/delivery:send`         | `{"event_id":"…"}`                                      |
| `alerts/discord/delivery:sendExamples` | `{"event_ids":["…"]}`                                   |
| `alerts/discord/delivery:sendLatest`   | `{}` for 10 renderable events, or `{"limit":15}` (1–50) |

`sendLatest` examines at most 500 recent events and sends selected cards oldest first, so it can
return fewer than requested. Batch tools group selected events; `sent` counts messages and
`skipped` counts filtered or failed events. Messages contain only alert cards; source event IDs remain
in webhook error diagnostics. Regenerating stored events can change their document IDs.

## Presentation policy

- Apply shared field selection and [pricing eligibility](pricing.md#alert-eligibility) before grouping.
- Apply the Discord pricing-frequency policy below before grouping the remaining changes.
- Five or more entities sharing an identical field change within one observation and entity kind form a batch.
- Residual changes remain in individual alerts without reapplying eligibility; empty updates disappear.
- Split long identity lists across cards. Oversized display text is truncated with diagnostics; source alerts stay intact.
- Decoding or interpretation failures log and skip the event before batching.
- Keep Discord markup within Discord presentation. Cards consume prepared facts without repeating interpretation.
- Use meter-specific scales; a single unit caption is misleading. Zero discount reads as no discount.
- Blank text renders as `null`; long prose uses marked excerpts around changed text. Mentions remain disabled.

Only model discoveries receive introductory cards. Known endpoints are relisted, known providers
have listed endpoints again, and known models now have listed endpoints. Unclassified arrivals
use neutral language. Provider alerts cover identity, locations, status, and terms/privacy URLs;
other provider policy metadata is outside scope. See [Events](events.md) for historical semantics.

## Frequent pricing changes

Frequent repricing is genuine state worth retaining in Events and Pricing History, but usually
unhelpful as repeated Discord alerts. Discord suppresses ordinary pricing fields when an endpoint
has at least **two prior quote entries within 24 hours** of the event. Unrelated selected fields
remain visible. Lifecycle alerts and detected schedule-definition changes bypass this check.
Monitor and Feed continue using shared eligibility without history reads.

The count and window are independent knobs in `alerts/discord/frequency.ts`. The range includes
the lower boundary and excludes the event's own `scan_at` and later observations. This lets live
delivery and historical replay use the same rule without requiring the current quote to have been
committed. Entries include initial/relisting quotes, small changes already excluded from alerts,
and scheduled movements; this measures quote frequency, not a count of previously delivered alerts.

There is no persisted mute state or provider-specific exception. Earlier quotes age out of the
window, allowing alerts to resume after a quiet period. Missing history can undercount and let an
alert through; database errors fail delivery rather than silently treating an endpoint as quiet.
History remains independently processed, so decisions can change if missing history is backfilled.
Atomic pricing history is not a prerequisite for this medium-specific policy.

The history query runs only for updates surviving the cheaper shared filters and reads at most
the count threshold per candidate using the endpoint/time index. Large price movements do not
override frequency suppression: the unwanted behavior is repeated updates, regardless of size.

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
