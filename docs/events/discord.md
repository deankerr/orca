# Discord alerts

## Direction

- One webhook target; the legacy bot approach will not return.
- Pre-alpha production demo in a private ORCA channel, intended to evaluate the live rendering UX.
- Apply the [coarse pricing filter](pricing.md#coarse-renderer-filter) and Discord field selection before grouping.
- Within each scan and entity kind, identical field changes on five or more entities become one batch bucket.
- Each batch bucket owns one field change; original events retain remaining fields, and empty updates disappear.
- Batch cards list affected identities and source IDs, splitting long identity lists across messages.
- Remaining updates are rendered without reapplying eligibility. Stored events and other feeds stay unchanged.

## Delivery and accepted limitations

- The live routine schedules newly committed event IDs when `ORCA_DISCORD_PREVIEW_ENABLED=true`.
- The scheduled action rechecks the switch on entry; already-running batches continue if it is later disabled.
- Enable only once ingestion is caught up. Disable before replaying old scans; no age filter is applied.
- Manual retries never broadcast. A completed or empty event commit supplies no IDs to send.
- One webhook target, `ORCA_DISCORD_WEBHOOK_URL`; two-second gaps between outgoing messages.
- No correctness or delivery guarantees: no outbox, delivery ledger, retry, deduplication or backfill.
- A scheduling failure after event commit loses that broadcast; event storage and subsequent ingestion proceed.
- Oversized text is truncated with `console.error`; batch pages retain every source ID and endpoint UUID prefix.
- Other render failures, HTTP errors (including 429), or action timeout abandon the remaining batch.
- Batches can overlap and interleave; no global ordering or rate coordination is promised.
- `send`, `sendExamples`, and `sendLatest` are explicit operator tools, bypass the preview switch, and can duplicate messages.
- `sendExamples` accepts `event_ids`. Deleting and regenerating events changes their IDs.
- `sendLatest` defaults to 10 renderable events, accepts `limit` from 1–50, scans at most 500 recent events, and sends selected cards oldest first.
- Each message includes `pre-alpha` and its source event ID(s) outside the card, in the same message.
- Batch tools group selected events; `sent` counts messages, `skipped` counts filtered events, not extracted items.
- Embed cards use message content; component cards use a sibling Text Display. Mentions remain disabled.
- Operational steps and cleanup commands live in the V4 Discord preview rollout notes.

## Rendering boundaries

- Discord presentation can specialize shared curated facts without changing captured events or `IChange` semantics.
- The Alerts pipeline owns eligibility, field selection and batching; cards consume prepared alerts.
- Entity cards own field layout and lifecycle presentation; `pricing.ts` shares price display across cards.
- Shared display helpers remain domain-agnostic. Keep Discord markup inside the Discord renderer.
- Padded inline code gives bounded fields such as pricing a tabular layout; arbitrary long keys need other layouts.
- Pricing meters have different scales; a shared unit caption would be misleading.
- Zero discount means no discount: transitions to/from zero render as removal/addition, not percentage deltas.
- Blank text renders as `null`; long prose uses marked excerpts around the changed text.

## Lifecycle semantics

- Models and providers are observed through listed endpoints; removal means no listed endpoints remain.
- Arrivals with `previously_known: false` announce discovery; only model discoveries use introductory cards.
- Known endpoints are relisted; known providers have listed endpoints again.
- Known models now have listed endpoints; historical records alone do not establish earlier endpoint presence.
- An unbackfilled historical model without earlier listings can be announced as discovered if metadata updates erase its Catalog timestamp evidence; see [the known limitation and backfill path](foundation.md#known-limitation-historical-models).
- Unclassified older arrivals use neutral listing language, without claiming discovery or return.
- Provider alerts cover identity, locations, status and terms/privacy URLs; other policy metadata is out of scope.
