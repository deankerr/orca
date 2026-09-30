# V4 Discord preview rollout

This is a **pre-alpha production demo** in a private ORCA Discord channel. Its purpose is to
evaluate the live feed's presentation. It has no correctness or delivery guarantees. The accepted
limitations are recorded in [Discord delivery](../events/discord.md#delivery-and-accepted-limitations)
and [historical model discovery](../events/foundation.md#known-limitation-historical-models).

## Rollout status

The production rollout and previous-generation data cleanup completed on 30 September 2026.
The one-off cleanup functions have been removed. Catalog, Listings, Pricing, Stats and ingestion
history were retained; the live preview now broadcasts fresh events.

Stored `processor: "listings"` rows and the optional, unused `previously_known_models` field remain
schema-compatible for other deployments. New work writes neither.

## Start the live preview

1. Configure `ORCA_DISCORD_WEBHOOK_URL` for the private preview channel. Webhook channel permissions
   determine who can see it. Confirm `ORCA_PUBLIC_URL` and `ENTITY_LOGO_SERVICE_ORIGIN` are appropriate.
2. Resume/catch up ingestion with broadcasting still disabled; verify there is no source backlog.
3. Set `ORCA_DISCORD_PREVIEW_ENABLED=true` on production only. Dev and preview deployments should
   keep it unset/false. Future routine commits schedule one single-attempt batch each.
4. To stop new broadcasts, set the flag false. Queued batches check it on entry; already-running
   batches finish or fail independently. Explicit `send`/`sendExamples` calls bypass this switch.

There is no automatic age cutoff: leave broadcasting disabled for any intentional historical replay.
Use the event ID shown beneath each card to inspect its stored facts; a missing message does not imply an event-processing failure.
