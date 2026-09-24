# Ingestion

Owns scan-pair admission, ingestion phases including Catalog, and the ORCA clock.
[Implementation stages](stages.md) governs refinement and deliberate deferrals.

## `ingestions`

One row represents an admitted real scan pair and its ingestion progress.

```ts
const ingestions = defineTable({
  from_scan_at: v.string(),
  scan_at: v.string(),
  phase: v.string(),
})
  .index('by_from_scan_at_and_scan_at', ['from_scan_at', 'scan_at'])
  .index('by_scan_at', ['scan_at'])
  .index('by_phase_and_scan_at', ['phase', 'scan_at'])
```

## Fields and invariants

- `from_scan_at` identifies the earlier real scan and selects the comparator. The first ingestion
  also owns its baseline at this time.
- `scan_at` identifies the later real scan and dates ordinary retained output. It must be greater
  than `from_scan_at`; both times follow [Scan's identity contract](scan.md#identity-and-time).
- `phase` identifies the next mutation step, or `complete` when all ingestion output is durable.
- The gate gives each output time one owner, avoiding per-row ingestion references.
- The earliest row identifies baseline ownership without an extra field.
- Writers validate increasing pairs and legal phase transitions.

## Ingestion phases

Each observation writes Records, Readings, Prices, Listings, current Models, current Providers and
current Endpoints in that order, with one mutation per table. Each successful mutation commits its
output and advances `phase` together, including empty steps. The final endpoint phase completes ingestion.

Phase names follow mutation boundaries. Use `v.string()` while the plan is being established;
completed rows retain only `complete`, allowing intermediate names to evolve between finished runs.
Keep the mutation and derivation plan stable while work is unfinished; deployments wait for completion.

One mutation per table is the intended naive implementation. Mutation-limit handling is deferred
until the full relevant mutation set can be measured and reviewed holistically. Guessed batching
must not change these semantic transaction guarantees. See [the limit-review gate](stages.md#2-review-mutation-limits-holistically--deliberately-deferred).

## Indexes

| Index                         | Purpose                                                         |
| ----------------------------- | --------------------------------------------------------------- |
| `by_from_scan_at_and_scan_at` | Find an accepted pair for continuation or its completed result. |
| `by_scan_at`                  | Find an ingestion by its output observation time.               |
| `by_phase_and_scan_at`        | Find unfinished work and compute the completed clock.           |

## Admission

| Request                      | Rule                                                      |
| ---------------------------- | --------------------------------------------------------- |
| First pair                   | Log is empty; reserve its baseline and later output time. |
| New forward pair             | `from_scan_at` equals the greatest completed `scan_at`.   |
| Accepted unfinished pair     | Resume its recorded work.                                 |
| Completed pair               | Return its completed result.                              |
| Earlier or disconnected pair | Outside ordinary admission rules.                         |

Admit one active ingestion at a time. Pairs form a forward-only connected chain; Catalog relies on
applying every admitted pair before proceeding. Both inputs are real scans, and a pair can span
missing captures. Reverse ingestion remains deferred.

## Workflows

### Initialization

1. Load and validate the first real pair, A → B, and reserve its row at the first initialization step.
2. Populate A directly: records, readings, starting prices/listings and all current tables.
3. Continue with the real A → B pair through forward ingestion.

Baseline output uses ordinary row shapes, A's real time and ordinary historical read rules. An
interrupted invocation resumes its recorded phase, including during baseline population.

### Forward ingestion

1. Load and validate A → B; prepare its output through [Projections](projections.md#transform-contracts).
2. Admit the pair or continue its accepted work.
3. Run the mutation plan from the recorded phase, calling the table-module writers.
4. Commit the final step with `phase = complete`.

The current runner consumes one pair per call. It loads and validates inputs before admission,
prepares each observation's output once and resumes writes from its recorded phase. An empty log
uses an explicit pair or the two earliest artifacts; subsequent discovery starts at the completed
clock. Capture remains owned by the shared Scan runner.

Each step checks its expected phase and row observation times before writing. Committed steps are
skipped on continuation. Orchestration and comprehensive failure/recovery handling are separate
[deferred stages](stages.md#5-design-operational-lifecycle--deliberately-deferred).

### Downstream work

Ingestion completion includes retained history and all current Catalog updates. It is independent
of future event interpretation and delivery. [Events](change-events.md) is fully deferred; its
execution state, claims and concurrency protocol will be designed when that stage opens.

## Clock reads

`currentScanAt` returns the greatest `scan_at` with `phase = complete`, or `null` when none exists.

- Ordinary reader cutoffs use this computed clock.
- Historical reads keep forward writes beyond the clock until completion.
- Historical baseline rows become readable when the first pair completes.
- An unchanged comparison advances the clock normally.
- Current Catalog rows update per table mutation and can be visible before completion; they are
  not a historical snapshot of the completed clock.
