# Discord alerts

## Direction

- One webhook target; the legacy bot approach will not return.
- Rendering is the current development focus; orchestration and durable delivery will follow.
- Currently one event becomes one notification; future iteration will explore batching and contextual filtering of storms.

## Delivery

- Manually send a stored event via `v4/discord:send`, using `ORCA_DISCORD_WEBHOOK_URL`.
- Delivery is single-attempt with Discord confirmation; repeat calls can duplicate messages.
- `v4/discord:sendExamples` accepts `event_ids` and replays them with one-second gaps; IDs change after resets.

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
- Unclassified older arrivals use neutral listing language, without claiming discovery or return.
- Provider alerts cover identity, locations, status and terms/privacy URLs; other policy metadata is out of scope.
