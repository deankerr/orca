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

## Target and pair registration

### Baseline

A target fixes the beginning of a timeline and an inclusive end. Its beginning cannot move; its end
can advance. The first available scan in the range is the baseline, with no predecessor. It establishes
observations, prices, and stats without creation Events. Current projections follow the same horizon
policy as later pairs.

- First-observation dates begin at the baseline capture.
- Selecting a different baseline requires a fresh timeline.

### Discovery

The target is managed independently of the sync worker. Each manual invocation reads the stored
target and resume position together, then discovers captures in batches. Target advances during a
run are picked up by the next invocation. The worker determines whether a later scan exists within
the range it read before registering a pair. Every registered pair fixes its predecessor
and `has_later_scan`; its record and initial Workpool enqueue commit in the same transaction.

- Discovery can run ahead of ingestion; ingest workers do not wait for earlier pairs to finish.
- Concurrent producers reuse registered pairs unchanged. Resuming starts after the latest registered scan.
- Keep source selection, capture contents, and projection rules stable while work is pending.
- An empty range registers no pairs. Extending the end can register captures later.

The target and registered pairs are the durable resume state. Each invocation checks the source after
the latest registered scan through the current target end, even if an earlier run exhausted that range.
An interrupted run retains every committed batch and resumes on the next invocation.

Scan owns bounded discovery and successor lookahead; ingestion chooses the target and registers pairs.
Existing registrations win without comparing incoming arguments. New pairs must extend the registered timeline.

### Current projections

Historical processes derive their output from the pair. When `has_later_scan` is true, current entity
processes retain only entities disappearing in that pair and current stats skip their projection.
The final pair projects all remaining current entities and stats. Current writes reject an older or
equal `scan_at`, so workers may finish out of order.

An unnecessary false flag adds current writes. An incorrect true flag on the final pair can leave
current state incomplete despite successful process receipts. Registration therefore establishes the
flag before enqueueing, and retries preserve it. Extending the target leaves an earlier final pair's
false flag intact.

## Completion and recovery

- Each process commits its complete output and receipt in one transaction, including empty output.
- Retries prepare normally but skip committed writes; overlapping attempts cannot duplicate output.
- A failed process leaves successful processes intact.
- Prepare and write failures return per-process results; escaping action errors use Workpool retries.
- Workpool completion records the attempt result for diagnostics and assesses the pair's process receipts.
- Completion requires an unremoved receipt for every currently registered ingestor, regardless of the attempt result.

Pair state caches this assessment for indexed product reads:

| State      | Meaning                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| `queued`   | Entrusted to Workpool, including waiting, execution, retries, and outstanding completion bookkeeping. |
| `complete` | All required process receipts exist.                                                                  |
| `failed`   | The attempt ended without all required receipts.                                                      |

Sync enqueues newly registered pairs; existing jobs remain entrusted to Workpool and terminal failures
remain `failed`. Reassessment and terminal-failure retry tooling are deferred. Changing a process's implementation does not
invalidate its receipts.

Replaced work IDs reject callbacks from older attempts. Repairing missing completion bookkeeping
is deferred.

Successful sync exhausts the available scans within its target snapshot; workers finish independently.
There is no automatic recovery schedule, earlier-history extension, or undo operation.

Concurrency and batch sizes are maintained in `config.md`; manual commands are in `development-data.md`.

## Product visibility

Committed process output is visible before pair completion. Partial failures can leave current views
ahead of historical products. The product clock follows the complete prefix of the registered timeline:
the earliest incomplete pair's predecessor, or the latest pair when all are complete. An incomplete
baseline yields no clock. Indexed state lookups avoid scanning historical pairs. Alert scheduling
remains deferred.

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

### ⚠️ Workpool coordination

Admission and completion still share Workpool coordination. Pair registration uses batches, and process
commits do not update a shared pair record. Overlapping direct enqueues can still repeat preparation;
receipts prevent duplicate output. Current rows can also contend when multiple pairs write the same
entity, especially around a final pair or a target extension.
