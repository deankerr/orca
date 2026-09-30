# Discord alerts

## Direction

- One webhook target; the legacy bot approach will not return.
- Pre-alpha production demo in a private ORCA channel, intended to evaluate the live rendering UX.
- One event becomes one notification; batching, storm filtering and durable delivery are deferred.

## Delivery and accepted limitations

- The live routine schedules newly committed event IDs when `ORCA_DISCORD_PREVIEW_ENABLED=true`.
- The scheduled action rechecks the switch on entry; already-running batches continue if it is later disabled.
- Enable only once ingestion is caught up. Disable before replaying old scans; no age filter is applied.
- Manual retries never broadcast. A completed or empty event commit supplies no IDs to send.
- One webhook target, `ORCA_DISCORD_WEBHOOK_URL`; one-second gaps within each scan's batch.
- No correctness or delivery guarantees: no outbox, delivery ledger, retry, deduplication or backfill.
- A scheduling failure after event commit loses that broadcast; event storage and subsequent ingestion proceed.
- Render failures, oversized cards, HTTP errors (including 429), or action timeout abandon the remaining batch.
- Batches can overlap and interleave; no global ordering or rate coordination is promised.
- `send` and `sendExamples` are explicit operator tools, bypass the preview switch, and can duplicate messages.
- `sendExamples` accepts `event_ids`. Deleting and regenerating events changes their IDs.
- Each message includes `pre-alpha` and the event ID outside the card, in the same message.
- Embed cards use message content; component cards use a sibling Text Display. Mentions remain disabled.
- Operational steps and cleanup commands live in the V4 Discord preview rollout notes.

## Rendering boundaries

- Discord presentation can specialize shared curated facts without changing captured events or `IChange` semantics.
- Entity cards own entity and field-specific decisions; only `pricing.ts` shares field knowledge across cards.
- Shared display helpers remain domain-agnostic. Keep medium-specific interpretation inside the Discord renderer.
- Padded inline code gives bounded fields such as pricing a tabular layout; arbitrary long keys need other layouts.
- Pricing meters have different scales; a shared unit caption would be misleading.
- Zero discount means no discount: transitions to/from zero render as removal/addition, not percentage deltas.
- Blank text renders as `null`; long prose uses marked excerpts around the changed text.

## Lifecycle semantics

- Models and providers are observed through listed endpoints; removal means no listed endpoints remain.
- Arrivals with `previously_known: false` announce discovery; only model discoveries use introductory cards.
- Known endpoints are relisted; known providers have listed endpoints again.
- Known models now have listed endpoints; historical records alone do not establish earlier endpoint presence.
- A historical model without earlier listings can be announced as discovered if metadata updates erase its Catalog timestamp evidence; see [the known limitation and `first_scan_at` path](foundation.md#known-limitation-historical-models).
- Unclassified older arrivals use neutral listing language, without claiming discovery or return.
- Provider alerts cover identity, locations, status and terms/privacy URLs; other policy metadata is out of scope.
