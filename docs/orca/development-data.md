# Development data

Ingestion derives Catalog from retained captures. Use the worktree's deployment and keep its object
source fixed for the timeline. Shared-source reads and local writes are configured independently in
`config.md`; newly collected local captures are not read while a remote source is selected.

Preview initialization is a no-op until ingestion orchestration is implemented.

Queue explicit scan pairs from `packages/backend`:

```sh
bunx convex run ingestion/enqueue:run '{"pairs":[{"from_scan_at":null,"scan_at":"<first-scan-at>","has_later_scan":true},{"from_scan_at":"<first-scan-at>","scan_at":"<next-scan-at>","has_later_scan":false}]}' --deployment <dev-deployment>
```

Use actual retained scan timestamps. A null `from_scan_at` establishes the baseline. Set
`has_later_scan` when there is a known later target scan; only the final target needs a full current-state
projection. The caller supplies this knowledge and keeps each pair's predecessor fixed when retrying.

The function returns Workpool IDs and accepts repeated pairs, including duplicates within one call.
Each process checks its completion record in its write transaction. This entrypoint does not create
scan registrations or advance the product clock.

`ingestion/enqueue:onComplete` logs the work ID, pair, and terminal result. Thrown action errors use
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
not cancel in-flight ingestion or move the baseline.
