# Collection and ingestion

## Capture and extraction

Collection parses OpenRouter responses and retains model/endpoint captures independently of Catalog.
Capture time marks completion of a request window, not an atomic upstream snapshot.

- A failed request prevents storing that scan; empty captures are rejected.
- Collection excludes `~` model aliases.
- Extraction requires text input and output and excludes `google/lyria*`.
- Models and providers are discovered only through endpoints; a model without endpoints is out of scope.
- Provider identity and representative selection follow `providers.md`.
- Stats come from `stats` and `statsByTier`, separately from entity facts; endpoint `status` is excluded.

## Comparison

Projections compare normalized facts before storage encoding. Price history and pricing Events compare
the same complete quote, independently of alert eligibility.

| Input                      | Comparison               |
| -------------------------- | ------------------------ |
| Objects                    | Key order is immaterial. |
| String arrays              | Sets.                    |
| Other arrays               | By index.                |
| Absence, null, false, zero | Distinct values.         |

⚠️ The comparator omits `__proto__` string-set members. Arrays directly nested in arrays
have limited positional comparison; supported entity shapes avoid that case.

## Target and registry

The target is an inclusive range of scan times. It can widen in either direction; its start can also advance while no record reads an earlier scan.
Target edits do not start work; sync kickoff starts both workers. `ingestion-workers.md` owns the register and queue worker logic,
current scopes, baseline moves, and resumption; `projections/model.md` owns record semantics.

- Records live in `ingestion_records`: pairs `from_scan_at → scan_at` and at most one baseline per scan.
- The `ingestionRecordCounts` aggregate counts records by kind and state over scan time.
- Every record write goes through `ingestion/records.ts`; aggregate writes are queued and reads are stale.
- The aggregate is derived: rebuild it from `ingestion_records` rather than repairing it.
- Both workers run as single steps and schedule themselves again until a step finds no work.
- Registration commits only if the registry edges it read are unchanged.
- Queue acceptance, Workpool enqueue, and the state change commit in one mutation.
- Accepted ingestion is capped; `queued` means handed to Workpool, not merely registered.
- One Workpool batch per queue step; completions find their record by work ID, so a stale ID matches nothing.
- At most one queue step waits to start; completions arriving meanwhile do not stack more.
- Only `queue:wake` touches the queue schedule; completions, kickoff, queue steps, and retries schedule it,
  so contention on that singleton never rolls back their own work.
- `ingestion/sync:run` kicks off sync manually; the ingestion cron invokes it when enabled.
- Sync never advances the target; continuous ingestion uses a far-future end.
- Preview initialization targets the preceding day once, then kicks off sync on every run.

## Execution and recovery

- An ingest request loads its record's scans and runs every process with the assigned scope and stats flag.
- Each process commits its output and a receipt per scan and process in one transaction, including empty output.
- Retries skip committed processes; overlapping attempts cannot duplicate output.
- A receipt records its coverage; a retry assigned a broader scope or the stats snapshot writes again.
- Any failed process fails the attempt, so Workpool retries it; exhausted retries mark the record `failed`.
- `ingestion/reconcile:sweep` finds queued or withdrawing records whose Workpool work has finished (at most 512 per kind and state).
- For each it schedules `confirmLost` after a 5-minute grace period, because Workpool deletes failed work and
  schedules its completion in one transaction, so finished-but-unsettled is briefly normal.
- `confirmLost` fails the record only if it still has the same work ID, is still accepted, and the work is still finished.
- A late completion still finds the record by work ID and overwrites its state.
- The hourly cron (when enabled) and `ingestion/admin:runSync` schedule the sweep; `kickoff` does not.
- A failed record waits for `ingestion/queue:retry`, which returns one or all failed records to `pending` without a scope.
- Withdrawal deletes history rows dated at the scan and releases every receipt; current rows stay.
- Only displaced baselines are withdrawn so far: their scan remains an input of the displacing pair.
- Changing a process's implementation does not invalidate its receipts.

Batch sizes and concurrency are maintained in `config.md`; manual commands are in `development-data.md`.

## Product visibility

Committed process output is visible before its record completes. Products read retained rows and
tolerate in-progress coverage. The product clock is the latest complete record's scan; earlier scans
may still be in progress during backfill.

| Product                      | Visibility                                                                 |
| ---------------------------- | -------------------------------------------------------------------------- |
| Grid and entity overviews    | Read committed current facts directly.                                     |
| Current stats                | Expose their own scan time.                                                |
| Monitor, Feed, stats history | Cap reads at the clock.                                                    |
| Pricing History              | Load histories independently; apply the clock during chart interpretation. |

Lifecycle alerts need a pair at their scan; a scan introduced only by a baseline has no comparison.
Completing an alerting record schedules automatic Discord delivery; delivery reads complete records only.

## Capacity and contention

### ⚠️ Complete-output mutations

- A process's full output must fit function arguments and transaction limits; a baseline is the largest.
- Current entity writes perform one indexed lookup per candidate row.
- Oversized inputs need bounded writes and resumable progress; retrying cannot make them fit.

### ⚠️ Workpool coordination

Process commits do not update a shared record. Current rows can contend when concurrent pairs write
the same entity; newest-wins merging keeps the result independent of completion order.
