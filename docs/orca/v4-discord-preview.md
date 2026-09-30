# V4 Discord preview rollout

This is a **pre-alpha production demo** in a private ORCA Discord channel. Its purpose is to
evaluate the live feed's presentation. It has no correctness or delivery guarantees. The accepted
limitations are recorded in [Discord delivery](../events/discord.md#delivery-and-accepted-limitations)
and [historical model discovery](../events/foundation.md#known-limitation-historical-models).

## Before merging

- Merge between ingestions, never immediately before or during one. Wait for active routines,
  continuations, processor attempts and retries to finish. Disabling the ingestion cron only
  prevents new cron starts; it does not stop already-scheduled continuations or manual runs.
- Resolve pending legacy Listings jobs with the old code before deployment. The new code writes
  Listings during acceptance and has no Listings retry processor. Cleanup refuses pending legacy jobs.
- Leave `ORCA_DISCORD_PREVIEW_ENABLED` unset or `false` through deployment, cleanup and catch-up.
- Schema compatibility is intentional: stored `processor: "listings"` rows remain valid, and the
  unused `previously_known_models` field stays optional. New work writes neither. Keep these
  compatibility declarations until every deployment has been cleaned; remove them in a later change.

## Clean previous-generation data after deployment

Run from `packages/backend`, targeting the intended deployment explicitly. These commands mutate
production; run them only as part of the approved production rollout. Do not run overlapping cleanup
chains, or ingestion, retries, regeneration or broadcasts touching the selected range. These are
operator tools, deliberately without maintenance locks or coordination with live ingestion.

```sh
bunx convex run --prod v4/cleanup:stripLegacyWork '{}'
```

This strips `previously_known_models` and deletes completed legacy Listings work rows. It preserves
Listings history. It traverses work in bounded pages and schedules its own continuation.

Then delete old events **and event work**, using a reviewed half-open scan-time range:

```sh
bunx convex run --prod v4/cleanup:deleteEvents \
  '{"from_scan_at":"<inclusive canonical UTC timestamp>","to_scan_at":"<exclusive canonical UTC timestamp>"}'
```

Replace both placeholders with `YYYY-MM-DDTHH:mm:ss.sssZ` timestamps. To clear the old generation,
start at or before its first event/work scan and end immediately after its final accepted scan
(for example, that exact timestamp plus one millisecond). Record the cutoff before resuming ingestion.
The upper boundary is excluded, so later observations survive. Dates without times are rejected.

Deletion proceeds in small transactions: events first, then their pending and completed event-work
records, including jobs that produced no events. Ingestions, Catalog, Listings history, Pricing and
Stats remain intact. This is deletion, not regeneration: keeping the ingestion records prevents an
ordinary routine resume from replaying the deleted range.

Both commands return **only their first batch's** result. Follow `convex logs --prod --success` until
the matching `[v4:cleanup]` chain logs `done: true`, and check for failed scheduled calls. A failed
chain can be restarted with the same original arguments; already-completed cleanup is harmless.

## Start the live preview

1. Configure `ORCA_DISCORD_WEBHOOK_URL` for the private preview channel. Webhook channel permissions
   determine who can see it. Confirm `ORCA_PUBLIC_URL` and `ENTITY_LOGO_SERVICE_ORIGIN` are appropriate.
2. Resume/catch up ingestion with broadcasting still disabled; verify there is no source backlog.
3. Set `ORCA_DISCORD_PREVIEW_ENABLED=true` on production only. Dev and preview deployments should
   keep it unset/false. Future routine commits schedule one single-attempt batch each.
4. To stop new broadcasts, set the flag false. Queued batches check it on entry; already-running
   batches finish or fail independently. Explicit `send`/`sendExamples` calls bypass this switch.

There is no automatic age cutoff: leave broadcasting disabled for any intentional historical replay.
No migration or cleanup command sends Discord messages. Use the event ID shown beneath each card to
inspect its stored facts; a missing message does not imply an event-processing failure.
