# Discord alerts

The private ORCA channel is a pre-alpha production demo for evaluating live alert presentation.
It uses one webhook target and has no correctness or delivery guarantees.

## Live controls

1. Configure `ORCA_DISCORD_WEBHOOK_URL`, `ORCA_PUBLIC_URL`, and `ENTITY_LOGO_SERVICE_ORIGIN`
   for the target deployment and channel.
2. Catch up ingestion with broadcasting disabled. There is no automatic age cutoff.
3. Enable `ORCA_DISCORD_PREVIEW_ENABLED=true` on production only. Keep it unset/false in dev and preview deployments.
4. Disable the flag before historical replay. Queued batches check it on entry; running batches finish or fail independently.

Fresh routine event commits schedule one single-attempt batch. Manual processor retries never
broadcast. Completed or empty commits provide no IDs to send. A scheduling failure after event
commit loses the broadcast without undoing the events or stopping subsequent ingestion.

There is no outbox, delivery ledger, automatic retry, or deduplication. Messages are paced two
seconds apart within a batch, but batches can overlap and interleave. HTTP errors (including 429),
render failures, or action timeouts abandon the remaining batch. A missing message does not
establish an event-processing failure.

## Manual delivery

Run from `packages/backend` with an explicit deployment. These tools bypass the preview switch
and can duplicate messages:

| Function                               | Arguments                                               |
| -------------------------------------- | ------------------------------------------------------- |
| `alerts/discord/delivery:send`         | `{"event_id":"…"}`                                      |
| `alerts/discord/delivery:sendExamples` | `{"event_ids":["…"]}`                                   |
| `alerts/discord/delivery:sendLatest`   | `{}` for 10 renderable events, or `{"limit":15}` (1–50) |

`sendLatest` examines at most 500 recent events and sends selected cards oldest first, so it can
return fewer than requested. Batch tools group selected events; `sent` counts messages and
`skipped` counts filtered or failed events. Messages include `pre-alpha` and source event IDs
outside the cards. Regenerating stored events can change their document IDs.

## Presentation policy

- Apply shared field selection and [pricing eligibility](pricing.md#alert-eligibility) before grouping.
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
