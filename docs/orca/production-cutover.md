# Production cutover

One-time switch of production (`dependable-husky-550`) from the legacy `v4_*` pipeline to the ingestion
workers. Delete this document once the cutover is complete and the legacy tables are removed.

## Approach

Production goes live directly and rebuilds Catalog from retained captures. Nothing is migrated except
`objects_locators`, which both versions share unchanged.

- The rewrite writes only new `catalog_*` and `ingestion_*` tables; it never reads or writes `v4_*` tables.
- Undeclared tables keep their documents, so the push succeeds while legacy data remains.
- The queue runs newest first: the first full pair completes current views within minutes of sync.
- Recent history follows immediately; older history fills in behind it.
- Products tolerate partial history; the clock is the latest complete record's scan.
- Backfilled pairs never alert; only forward pairs registered after bootstrap can reach Discord.

🔭 2026-10-21: a dev deployment completed roughly 100–200 pairs/min at parallelism 64, about one pair
per hourly scan. That suggests about an hour per year of history; production throughput is unmeasured.

## Before merging

Run commands from `packages/backend`. Stopping the legacy cron freezes `v4_*` data until the switch.

```sh
bunx convex env set ORCA_INGESTION_CRON_ENABLED false --prod
bunx convex env set ORCA_DISCORD_AUTO_SEND_ENABLED false --prod
bunx convex env set ORCA_INGESTION_PARALLELISM 64 --prod
```

- Leave `ORCA_SCAN_CRON_ENABLED` on: collection is independent and must not gap.
- Confirm sign-in to `https://orca.orb.town/admin` works for the production administrator.

## Deploy and start

Squash-merge the PR. Vercel deploys Convex, installing the `ingestionPool` and `ingestionRecordCounts`
components, then builds the web app. Current views are empty until the first pair completes.

Immediately after the deploy finishes, open `https://orca.orb.town/admin/ingestion`:

1. Read the earliest source scan under Source scans.
2. Save the target from that scan's date to `2099-01-01`; a far-future end keeps registration open.
3. Press Run sync.

CLI equivalent, with the first scan's date substituted:

```sh
bunx convex run ingestion/target:set '{"start_at":"<first-scan-date>","end_at":"2099-01-01"}' --prod
bunx convex run ingestion/sync:run '{}' --prod
```

## Monitor

The dashboard is reactive; leave it open during the backfill.

| Signal                  | Expected                                                               |
| ----------------------- | ---------------------------------------------------------------------- |
| Current view            | Set within minutes; Grid and overviews show current data from then on. |
| Completion rate and ETA | Stable after a few minutes; sampled by the open page over 5 minutes.   |
| Queue frontier          | Moves steadily back in time; the histogram fills from the right.       |
| Queued                  | Near 4 × parallelism; pending holds the rest.                          |
| Failed                  | Zero; failures need a retry after their cause is fixed.                |
| Baseline                | Pending until every pair settles, then complete.                       |

```sh
bunx convex run ingestion/records:counts '{}' --prod
bunx convex insights --prod
bunx convex logs --prod
```

- `insights` reports OCC retries and limit errors; it aggregates with a delay of up to an hour.
- Failed records show their error in the dashboard's Records table, filtered by `failed`.

## Adjust parallelism

Parallelism applies on the next queue step without a deploy; running actions finish unaffected.

```sh
bunx convex env set ORCA_INGESTION_PARALLELISM 32 --prod
```

| Observation                                        | Action                                   |
| -------------------------------------------------- | ---------------------------------------- |
| Rate rises with parallelism and nothing fails      | Raise in steps, up to 100.               |
| Rate falls or flattens after a raise               | Return to the previous value.            |
| Failures from timeouts, rate limits, or the source | Lower it, fix the cause, then retry all. |
| User-facing queries slow down                      | Lower it; backfill speed is secondary.   |

Retry failures from the Records table, or one batch per call from the CLI until it returns 0:

```sh
bunx convex run ingestion/queue:retry '{}' --prod
```

## After the backfill

Every record is complete and the baseline is installed.

```sh
bunx convex env set ORCA_INGESTION_CRON_ENABLED true --prod
bunx convex env remove ORCA_INGESTION_PARALLELISM --prod
```

- Confirm the next hourly sync (minute 50) registers and completes the new scan's pair.
- Enable Discord last, after a forward pair has completed: `ORCA_DISCORD_AUTO_SEND_ENABLED` to `true`.
- Spot-check Grid, Monitor, Feed, and Pricing History against the source.

## Roll back

Revert the merge on `main`. Vercel redeploys the legacy code against its intact `v4_*` tables.

- Re-enable `ORCA_INGESTION_CRON_ENABLED`; the legacy pipeline resumes from its own clock.
- Unset `ORCA_INGESTION_PARALLELISM`; the legacy code ignores it.
- New tables remain as undeclared data and removed components are unmounted; delete them when done.

## Clean up

After a period of confidence, delete the `v4_*` tables in the Convex dashboard, then delete this document.
