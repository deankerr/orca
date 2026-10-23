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
accepted. The range can widen in either direction, and its start can advance while no record reads an
earlier scan; moving the start back moves the
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

## Load testing ingestion

Serial and simulated tests cannot reproduce OCC contention between concurrent actions and mutations, which
appeared in production only under real concurrency. Run the load test on a development deployment with
object source access (see `config.md`) before merging changes to ingestion transactions, queue or pool
behavior, or record-count writes. From the repository root:

```sh
bun run --cwd packages/scripts ingestion-load --deployment dev:<name> [--hours 24] [--parallelism 32] [--timeout 25]
```

- `--deployment` is required, a `dev:` name, and must equal `CONVEX_DEPLOYMENT` in `packages/backend/.env.local`.
- Numeric options are validated before the deployment changes: integers, `--parallelism` from 1 to 100 (the pool maximum).
- It refuses to run when `CONVEX_DEPLOY_KEY` is set and never passes `--prod`.
- Push the code under test first (`convex dev --once`); the run uses `internal.ingestion.admin.sourceScanBounds`.
- It sets `ORCA_INGESTION_PARALLELISM`, targets the window ending at the latest source scan, and kicks off sync.
- It streams `convex logs --jsonl --success` for the whole run and polls counts.
- Records settling is not enough: once quiet, it runs a register step and finishes only when that returns `idle`,
  which proves registered pairs and the baseline cover the target. Any other result resumes waiting.
- Lost completions are confirmed after a 5-minute grace period. It sweeps at the end and waits for that period
  (plus a margin, logs still open) only if records remain queued or withdrawing, e.g. after a timeout.
- A deployment with records is refused unless `--allow-existing`; the new window must then widen the target.
  No reset exists; dropping deployment data is the supported way to restart a timeline.

The run passes (exit 0) when registration is idle and no record remains pending, queued, or withdrawing before
the timeout, no record is failed (read directly from the index, not aggregate counts), no execution ended on
exhausted OCC retries, no `completion lost` line appeared, and the log stream stayed open throughout. Otherwise it exits 1.
Retried OCC conflicts are expected under load: they are reported per function (`queue:wake`, `pool:complete`)
as evidence, not failures. A rising retry count relative to executions, or any exhaustion, indicates a hot document.

`convex insights` covers a 72-hour window across all activity, reporting OCC conflicts and resource-limit events.
The first load run recorded 205 retried conflicts and an empty insights list, so insights alone understate
contention that retries absorb. The dashboard Insights tab (the script prints its URL) shows the same view.
