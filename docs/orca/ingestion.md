# Collection and ingestion

## Capture and extraction

Collection parses OpenRouter responses and retains model/endpoint captures independently of Catalog.
Capture time marks completion of a request window, not an atomic upstream snapshot.

- A failed request prevents storing that scan; empty captures are rejected.
- Collection excludes `~` model aliases.
- Extraction requires text input and output, excludes `google/lyria*`, and includes endpointless models.
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

## Registration and recovery

### Baseline

A registration fixes a scan and its predecessor before work starts. The baseline has no predecessor:
it establishes current facts, observations, prices, and stats without creation Events.

- First-observation dates begin at the baseline capture.
- Selecting a different baseline requires a fresh timeline.

### Commit and retry

- Each process commits its complete output and progress in one transaction, including empty output.
- Retries skip committed processes; overlapping attempts can repeat computation but cannot duplicate output.
- A failed process leaves successful processes intact.
- Final completion atomically advances the clock and schedules continuation and eligible Discord preparation.

### Advancement

Only the latest completed registration can admit a successor. Missing captures or a persistently failing
process stop advancement until repaired.

- Recovery requeues pending work even when scheduled admission is disabled.
- Manual invocations, continuations, and active work also bypass the admission switch.
- Keep source selection, capture contents, and projection rules stable while work is pending.
- Completed registrations do not reopen when code changes or processes are added.
- The runner only continues forward; it has no earlier-history extension or selective replacement operation.

Schedules and concurrency are maintained in `config.md`.

## Product visibility

Committed process output is visible before registration completion. Partial failures can leave current
views ahead of historical products.

| Product                      | Visibility                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| Grid and entity overviews    | Read committed current facts directly.                                                 |
| Current stats                | Expose their own scan time.                                                            |
| Monitor, Feed, stats history | Cap reads at completed ingestion.                                                      |
| Pricing History              | Load histories independently; apply the completed horizon during chart interpretation. |

## Capacity and contention

### ⚠️ Complete-output mutations

- A process's full output must fit function arguments and transaction limits.
- Current entity writes perform one indexed lookup per changed row.
- Oversized inputs need bounded writes and resumable progress; retrying cannot make them fit.

### ⚠️ Shared registration progress

Concurrent processes contend on one `scan_registrations` document. Conflict retries repeat the entire
output mutation, increasing work and latency.

Reduce contention on shared progress; increasing worker concurrency leaves this bottleneck intact.

### ⚠️ Workpool coordination

Admission and completion incur recovered coordination conflicts. Repeated discovery or recovery can
enqueue overlapping attempts.

Reduce coordination retries and redundant admission. Committed-progress deduplication prevents duplicate
output but still allows wasted computation.
