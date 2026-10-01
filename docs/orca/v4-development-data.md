# V4 development data

Populate a fresh dev deployment by replaying a short window of production scans through V4.
The destination builds its own Catalog, Pricing, Listings, processor work, and current Stats.
It reads compressed source objects remotely; it does not copy source tables or local object locators.

## Choose a small baseline

- **Grid:** two recent captures are enough to initialize and process one pair.
- **Pricing History demo:** choose a few days containing known listing changes. More elapsed time
  is useful only when it adds an example the demo needs.
- The baseline is the first capture at or after `start_at`, which accepts an ISO date (UTC midnight)
  or a timezone-qualified timestamp. Two captures at or after it must exist.
- Initialization retains facts present at the baseline, not the source deployment's cumulative
  knowledge from earlier history. Earlier departed endpoints and their history will be absent.
- There is no end-time or pair-count argument: continuations consume available pairs until caught
  up. `start_at` limits how far back initialization begins, not how many pairs a call executes.
- Always supply `start_at` on a fresh demo timeline. Omitting it starts from the earliest source
  pair, which can mean replaying the entire archive.

The verified demo uses `start_at: "2026-09-25"`: roughly 40 hourly captures, with endpoint
removals, reappearance, and contextual listing changes. Dates below are that reproducible example;
choose a more recent window when needed.

## 1. Prepare the destination

Deploy the current backend to a fresh **dev** deployment for a manually chosen baseline.
Preview deployments instead run `convex/init.ts` automatically through Vercel's `--preview-run init`:
it schedules V4 with `start_at` two days before initialization, or resumes without `start_at` if a
V4 clock already exists. Scheduled continuations catch up to the source's latest available pair.
The initializer does not wait for catch-up; the product fills as the replay progresses.

Run these commands from `packages/backend`, replacing the deployment name as appropriate:

```sh
export DEV_DEPLOYMENT=reliable-swan-376
```

Required deployment environment (also configure these as project defaults for previews):

| Deployment             | Variable                         | Value                                      |
| ---------------------- | -------------------------------- | ------------------------------------------ |
| Dev/preview            | `ORCA_OBJECTS_SOURCE_DEPLOYMENT` | `dependable-husky-550` (a name, not a URL) |
| Dev/preview and source | `ORCA_OBJECTS_API_KEY`           | The same nonempty shared key               |
| Dev/preview            | `ORCA_SCAN_ENABLED`              | `false`                                    |
| Dev/preview            | `ORCA_V4_INGEST_CRON_ENABLED`    | Unset or `false` for manual refresh        |

The source must have `objects/remote` deployed and access to its stored artifacts. Dev needs no
R2 credentials: the source reads its storage and returns compressed bytes. Keep the configured
source fixed once a timeline exists, including while retrying outstanding work.

Preview initialization needs at least two source captures in its two-day window. Source/auth
failures or an insufficient capture window surface in the scheduled routine's logs. The recovery
rules below also apply to previews, including investigation/reset after partial initialization.

Before first initialization, check that all V4 output/work tables are empty, not just the clock.
Initialization writes several tables in separate transactions; a null clock alone does not prove
that an earlier attempt left no partial output.

```sh
bunx convex run --deployment "$DEV_DEPLOYMENT" --inline-query '
  const tables = ["v4_models", "v4_providers", "v4_endpoints",
    "v4_endpoint_pricing_history", "v4_endpoint_listing_history",
    "v4_scan_ingestions", "v4_processor_work", "v4_current_stats_snapshot",
    "v4_events", "v4_endpoint_stats"];
  const occupied = [];
  for (const table of tables) {
    if (await ctx.db.query(table).first() !== null) occupied.push(table);
  }
  return { occupied };
'
```

For an already initialized timeline, use the resume step instead.

## 2. Check discovery before writing

```sh
bunx convex run --deployment "$DEV_DEPLOYMENT" v4/scan/load:selectPair \
  '{"from":"2026-09-25"}'
```

This read-only action exercises source selection, authentication, and discovery. It should return
the baseline's `from_scan_at` and its successor's `scan_at`. `null` means there is no complete
pair in that range. It does not yet exercise object download, decompression, or projection.

## 3. Initialize and let continuation finish

```sh
bunx convex run --deployment "$DEV_DEPLOYMENT" v4/routine:run \
  '{"start_at":"2026-09-25"}'
```

The command awaits the first pair and schedules the next one. Command completion is **not**
completion of the replay. Baseline listings/prices are initial knowledge, not creation events.
Manual runs and already-scheduled continuations work with V4 cron admission disabled.

Inspect the shared clock and pending work:

```sh
bunx convex run --deployment "$DEV_DEPLOYMENT" v4/clock:get '{}'
bunx convex run --deployment "$DEV_DEPLOYMENT" \
  v4/ingestion/progress:listProcessorWork \
  '{"processor":"pricing","state":"pending","paginationOpts":{"numItems":100,"cursor":null}}'
bunx convex run --deployment "$DEV_DEPLOYMENT" \
  v4/ingestion/progress:listProcessorWork \
  '{"processor":"events","state":"pending","paginationOpts":{"numItems":100,"cursor":null}}'
```

Pending work for the newest pair and temporarily older Stats are normal while that pair runs.
Once settled, verify:

- `selectPair` with `from` set to the returned clock yields `null`: no later pair is available.
- Both pending-work queries return empty pages.
- `v4/stats/query:grid` has nonempty `rows` and `as_of` equal to the clock.
- `v4/catalog/endpoints/query:grid` returns the expected current endpoints.

Use `convex logs --deployment "$DEV_DEPLOYMENT" --success` to inspect a stalled or failed run.

## 4. Resume or recover

Refresh the same timeline without `start_at`:

```sh
bunx convex run --deployment "$DEV_DEPLOYMENT" v4/routine:run '{}'
```

Resume advances from the clock; it does not retry older failed History obligations. Retry those
by ID using `v4/retry:pricing` or `v4/retry:events` with `{"work_id":"…"}`. Listings commits
with Catalog during acceptance and has no separate retry obligation. Use
`v4/refreshStats:run` with `{}` if current Stats remains behind after processing finishes.

If initialization fails with no clock but occupied V4 tables, inspect the failure before starting
again; initialization is not resumable. A replacement disposable dev deployment is the simplest
way to choose a different baseline or restart a partial initialization. There is no supported
prepend-history operation for an existing timeline.

## 5. Connect the product

When running the web app, set `NEXT_PUBLIC_CONVEX_URL` in `apps/web/.env.local` to this dev
deployment's cloud URL. Grid, Entity Overview, and Pricing History read V4.

See [Pricing History](v4-pricing-history.md) for verified examples and
the client/backend work that remains.

## Verified replay

On 2026-09-26 UTC, this procedure populated `reliable-swan-376` from production:

| Check                          | Result                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| Actual baseline                | `2026-09-25T00:40:04.073Z`                                                               |
| Caught-up clock                | `2026-09-26T15:40:04.139Z`                                                               |
| Ingestions                     | 39 consecutive pairs, using 40 captures                                                  |
| Processor work                 | 78 complete; none pending                                                                |
| Grid                           | 1,385 endpoints: 1,372 listed and 13 unlisted during the retained window                 |
| Current Stats                  | 1,218 readings at the shared clock                                                       |
| Retained history               | 1,406 listing rows and 1,629 pricing rows, including 1,370 baseline rows each            |
| Post-baseline listing activity | 15 first listings in this timeline, 14 unlistings, one reappearance, six context changes |
| Source catch-up                | Discovery from the final clock found no next pair                                        |
| V3 / local source copies       | No V3 ingestions; no local object locators                                               |

All listed endpoint product fields and all stats readings matched production at the same clock,
ignoring deployment-specific document fields and Catalog row write times. Production had 163 more
Grid rows because its longer timeline retained additional recently unlisted endpoints. That is an
expected difference for this short demo, not missing current coverage.
