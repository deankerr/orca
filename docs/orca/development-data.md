# Development data

Ingestion derives Catalog from retained captures. Use the worktree's deployment and keep its object
source fixed for the timeline. Shared-source reads and local writes are configured independently in
`config.md`; newly collected local captures are not read while a remote source is selected.

The admin dashboard at `/admin/ingestion` saves the target, runs sync, retries failures, and shows
progress. The equivalent commands run from `packages/backend`; set a target, then kick off sync:

```sh
bunx convex run ingestion/target:set '{"start_at":"2026-10-10","end_at":"2026-10-11"}' --deployment <dev-deployment>
bunx convex run ingestion/sync:run '{}' --deployment <dev-deployment>
```

Bounds are inclusive UTC instants. ISO dates mean midnight UTC; offset-bearing timestamps are also
accepted. The range can widen in either direction but never shrinks; moving the start back moves the
baseline. An empty range registers nothing. Both workers repeat until idle; kick off sync again after
new scans arrive or a worker invocation fails.

Inspect progress with `bunx convex run ingestion/records:counts '{}'` or in the `ingestion_records` table. Ingestion is finished when every record is
`complete` and both workers return `idle`. A `failed` record keeps its `error`; after fixing the cause,
return one or every failed record to pending. Retry-all is batched; repeat it until it returns 0:

```sh
bunx convex run ingestion/queue:retry '{"record_id":"<record-id>"}' --deployment <dev-deployment>
bunx convex run ingestion/queue:retry '{}' --deployment <dev-deployment>
```

`ingestion/ingestors.ts` selects the processes to run. Each ingestor declares a stable process name;
changing it creates a different completion identity. Dropping deployment data is the supported way to
restart a development timeline.
