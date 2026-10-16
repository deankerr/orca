# Development data

Ingestion derives Catalog from retained captures. Use the worktree's deployment and keep its object
source fixed for the timeline. Shared-source reads and local writes are configured independently in
`config.md`; newly collected local captures are not read while a remote source is selected.

Preview initialization remains a no-op; range ingestion is invoked manually.

Set a target, then trigger the sync worker from `packages/backend`:

```sh
bunx convex run ingestion/target:set '{"start_at":"2026-10-10","end_at":"2026-10-11"}' --deployment <dev-deployment>
bunx convex run ingestion/sync:run '{}' --deployment <dev-deployment>
```

Bounds are inclusive UTC instants. ISO dates mean midnight UTC; offset-bearing timestamps are also
accepted. The first available scan within the range establishes the baseline. Keep `start_at` fixed
when setting the target again and repeat or increase `end_at`. Setting the target does not start sync.
An empty range registers no pairs; running sync without a target throws.

The sync worker reads the stored target and resume position together, then discovers, registers,
and enqueues new pairs in batches. It implements the target read at startup;
advances made during a run are picked up by the next invocation. It returns the registration count
and last scan time; ingest workers continue independently. Rerun `ingestion/sync:run` after a sync-worker failure.
Queued jobs are retained and terminal failures stay failed.

Every invocation checks for scans after the registered tail through the current target end.
Empty or previously exhausted ranges can be checked again; completed pairs are reused unchanged.

Inspect the target and pair results:

```sh
bunx convex run ingestion/target:get '{}' --deployment <dev-deployment>
bunx convex run ingestion/pairs:list '{"paginationOpts":{"numItems":50,"cursor":null}}' --deployment <dev-deployment>
```

Continue listing with the returned `continueCursor` until `isDone`. A successful sync has exhausted
the available captures within the target it read. Wait for every pair to become `complete` for ingestion
to finish; the latest pair finishing does not establish that earlier pairs have finished.

Pair arguments and their initial enqueue commit atomically. One-scan lookahead determines
`has_later_scan` before registration; retries preserve that decision and the selected predecessor.
An older callback cannot overwrite a newer attempt. The product clock follows the complete prefix
of these pairs; alert scheduling remains deferred.

For the lower-level demo, queue explicit scan pairs:

```sh
bunx convex run ingestion/enqueue:run '{"pairs":[{"from_scan_at":null,"scan_at":"<first-scan-at>","has_later_scan":true},{"from_scan_at":"<first-scan-at>","scan_at":"<next-scan-at>","has_later_scan":false}]}' --deployment <dev-deployment>
```

Use actual retained scan timestamps. A null `from_scan_at` establishes the baseline. Set
`has_later_scan` when there is a known later target scan; only the final target needs a full current-state
projection. The caller supplies this knowledge and keeps each pair's predecessor fixed when retrying.

The function returns Workpool IDs and accepts repeated pairs, including duplicates within one call.
Each process checks its completion record in its write transaction. This entrypoint does not create
orchestrator pair records or advance the product clock. Keep its inputs consistent with any registered pairs.

`ingestion/enqueue:logIngestResult` logs the work ID, pair, and terminal result. Thrown action errors use
Workpool's automatic retries. Returned process failures are logged without automatic retry; enqueue
the same pair again to complete outstanding processes. A transaction retry can repeat a completion
log; its work ID identifies the same job.

The collection in `ingestion/ingestors.ts` selects the processes to run. Each ingestor declares its
process name once; the factory passes it to write and remove mutations. Keep that name stable for
the same output: changing it creates a different completion identity. Baseline pairs use an
ingestor's optional `baseline` preparation function, falling back to its normal `prepare` function.

To remove one scan's history for another demo, first let outstanding ingestion finish, then run:

```sh
bunx convex run ingestion/remove:run '{"scan_at":"<scan-at>"}' --deployment <dev-deployment>
```

Events, observations, pricing history, and stats history delete that scan's output and set
`removed_at` on their completion records in the same transaction. Repeated removal returns
`already_removed`; re-enqueuing the original pair regenerates those processes and clears the marker.
Current tables return `unsupported` and retain their output and completion records. Removal failures
return `stage: "remove"` and leave that process's output and record unchanged. This operation does
not cancel in-flight ingestion or move the baseline. Removal is experimental and does not update cached
pair state; use explicit pair replay for this demo.
