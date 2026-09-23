# Ingestion

Owns scan-pair admission, orchestration, progress, shared process claims and the ORCA clock.

## `ingestions`

One row represents an admitted real scan pair and the progress of its ingestion and downstream work.

### Schema

```ts
const processState = v.optional(literals('running', 'complete', 'failed'))

const ingestions = defineTable({
  from_scan_at: v.string(),
  scan_at: v.string(),
  phase: v.string(),
  catalog: processState,
  events: processState,
})
  .index('by_from_scan_at_and_scan_at', ['from_scan_at', 'scan_at'])
  .index('by_scan_at', ['scan_at'])
  .index('by_phase_and_scan_at', ['phase', 'scan_at'])
  .index('by_catalog', ['catalog'])
```

### Fields and invariants

| Field          | Meaning or constraint                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------- |
| `from_scan_at` | Earlier real scan; selects the comparator. The first ingestion also owns its baseline at this time. |
| `scan_at`      | Later real scan; dates ordinary retained output. Must be greater than `from_scan_at`.               |
| `phase`        | Next mutation step in the current ingestion plan, or `complete`.                                    |
| `catalog`      | Lifecycle state for a Catalog execution anchored to this completed ingestion.                       |
| `events`       | Lifecycle state for Events processing this completed ingestion.                                     |

- Scan times follow [Scan's identity contract](scan.md#identity-and-time).
- The gate gives each output time one owner, avoiding per-row ingestion references.
- The earliest row identifies baseline ownership without an extra field.
- Writers validate increasing pairs and legal phase transitions.

#### Ingestion phases

| Phase              | Meaning                                                                     |
| ------------------ | --------------------------------------------------------------------------- |
| Mutation-step name | The next mutation to execute in the ingestion plan.                         |
| `complete`         | All required records and series are durable, including an empty comparison. |

- Phase names follow mutation boundaries; a module can require several steps, and a mutation can call
  several modules.
- Use `v.string()` while the mutation plan is being established. Completed rows retain only
  `complete`, so intermediate names can evolve between finished runs.
- Each successful mutation commits its output and advances `phase` together.
- Every successful ingestion ends at `complete`, independently of cache freshness and event publication.

#### Process state

Both optional process fields store a status directly:

| Stored state | Meaning                                | Holds a lock |
| ------------ | -------------------------------------- | ------------ |
| Field absent | Work has yet to start                  | No           |
| `running`    | An execution owns this process slot    | Yes          |
| `complete`   | The process declares its work complete | No           |
| `failed`     | Execution ended unsuccessfully         | No           |

- Arbitrary Events decision data belongs inside Events.
- Completion can be silent; zero output is a valid result.
- Each module defines retry behavior and whether completed work can run again.
- A Catalog outcome describes that run; later refreshes can change the cache.

### Indexes

| Index                         | Purpose                                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `by_from_scan_at_and_scan_at` | Find an accepted pair for continuation or its completed result.                            |
| `by_scan_at`                  | Find an ingestion by its output observation time.                                          |
| `by_phase_and_scan_at`        | Find unfinished work, compute the clock and discover completed inputs for downstream work. |
| `by_catalog`                  | Enforce global Catalog exclusion. Events checks its target row directly.                   |

### Admission

| Request                           | Rule                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| First pair                        | Log is empty; reserve both its baseline and later output time. |
| New forward pair                  | `from_scan_at` equals the greatest completed `scan_at`.        |
| Accepted unfinished ordinary pair | Resume its recorded work when the gate permits.                |
| Completed pair                    | Return its completed result.                                   |
| Earlier or disconnected pair      | Outside the ordinary action's admission rules.                 |

- Admit one active ingestion at a time.
- Both inputs are real scans; a pair can span missing captures.

🚧 Reverse ingestion is deferred.

### Downstream concurrency

Admission checks and claim acquisition commit together under these rules:

| Operation starting | Admission rule                                                               |
| ------------------ | ---------------------------------------------------------------------------- |
| Catalog refresh    | Target ingestion is complete; ingestion is idle; every Catalog slot is idle. |
| Events execution   | Target ingestion is complete; ingestion is idle; its Events slot is idle.    |
| Forward ingestion  | Ordinary ingestion gate; existing downstream work can continue.              |

- Catalog and Events can coexist; Events executions on distinct ingestions can coexist.
- Active ingestion blocks new downstream starts.
- Multi-step downstream reads select completed observation times explicitly.
- Process modules can impose tighter limits on their own work.

## Workflows

### Initialization

1. Load and validate the first real pair, A → B, and reserve its row at the first initialization step.
2. Populate A directly: complete entity state, supplied readings and starting price/listing values.
3. Continue with the real A → B pair through the forward workflow below.

**Baseline output:** uses ordinary row shapes, A's real time and ordinary historical read rules.
Events receives the real pair only.

**Interruption:** a failed baseline or first pair means initialization failed. Manually clear the
partially initialized dataset and ingestion/process state, then restart from artifacts.

Baseline writes can use bounded mutations. Keep deployments outside initialization.

### Forward ingestion

1. Load and validate A → B; admit a new pair at its first mutation step or continue accepted work.
2. Use [Projections](projections.md#transform-contracts) to prepare output from the supplied scans.
3. Run the mutation plan from the stored `phase`, calling the relevant table-module writers.
4. Commit the final step with `phase = complete` and request [Catalog refresh](catalog.md#refresh-requests).

**Step execution:** check the expected phase before writing. The phase advances with the mutation's
output, including steps with no rows to write.

**Retry:** resume from the stored phase and skip already committed steps. Keep the mutation and
derivation plan stable while work is unfinished; deployments wait for ingestion to finish.

**Implementation recommendation:** choose step names and mutation boundaries alongside each module's
writes. Each mutation must fit Convex's limits; the plan can evolve as those writes change.

### Downstream execution

1. Select a completed ingestion and acquire the module's claim in a mutation.
2. Execute the module against its selected completed observations.
3. Record the outcome and release the claim when that module execution ends.

The ingestion action can call this work directly after its completion commit. Independent runners
use the same module functions and claim protocol.

**Claim lifetime:** hold the claim while the module can read or write. Release it when the module
finishes, even if the calling action continues with other work.

**Interruption:** explicit recovery releases a stranded claim after confirming its owner stopped.
Process outcomes remain stored. Overlap prevention supplies no cross-mutation retry atomicity;
each module defines its commit/retry behavior.

🚧 Automated abandoned-run recovery follows operational need. The initial protocol has no lease
expiry or live-owner takeover; automated takeover would require owner fencing.

## Clock reads

`currentScanAt` returns the greatest `scan_at` with `phase = complete`, or `null` when none exists.

- Ordinary reader cutoffs use this computed clock.
- Forward writes remain beyond it until completion.
- Baseline rows become readable when the first pair completes.
- An unchanged comparison advances it normally.
- Product materializations can choose their own time and refresh lifecycle; their readers can hide
  ingestion bookkeeping.
