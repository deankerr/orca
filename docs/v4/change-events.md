# Change Events

Owns arbitrary interpretation of completed ingestions and the resulting publications, building on
the existing `changeEvents` module.

## `changeEvents`

One row is a selected claim published for consumers about a primary MEP subject.

### Schema

```ts
const changeEvents = defineTable({
  entity_kind: literals('model', 'provider', 'endpoint'),
  entity_id: v.string(),
  kind: v.string(),
  scan_at: v.string(),
  published_at: v.number(),
  content_json: v.string(),
})
  .index('by_scan_at', ['scan_at'])
  .index('by_published_at', ['published_at'])
  .index('by_entity_kind_and_entity_id_and_scan_at', ['entity_kind', 'entity_id', 'scan_at'])
```

### Fields and invariants

| Field                      | Meaning or constraint                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------- |
| `entity_kind`, `entity_id` | Primary subject's native MEP identity.                                                 |
| `kind`                     | Selects an Events-owned payload contract.                                              |
| `scan_at`                  | Equals the owning ingestion's `scan_at`.                                               |
| `published_at`             | Publication time in Unix milliseconds; preserved when copied between deployments.      |
| `content_json`             | Validated selected claims and values, with optional denormalized presentation context. |

- Publications are immutable. Corrections become subsequent events.

### Payloads

- Event kinds own their validators; malformed content fails validation before commit.
- Payloads must fit a bounded publication. Rules split oversized output deliberately.
- Published claims remain self-contained; broader context can be hydrated through Records or Scan.
- Decoded unfamiliar kinds have an inspectable JSON fallback.
- Price interpretation uses [shared meter meanings and units](projections.md#pricing-selection).

An illustrative pricing claim separates selected values from presentation context:

```json
{
  "prices": {
    "before": { "input": 0.000001 },
    "after": { "input": 0.000002 }
  },
  "context": {
    "model_id": "example/model",
    "provider_id": "example-provider",
    "provider_tag": "example-provider"
  }
}
```

### Indexes

| Index                                      | Purpose                         |
| ------------------------------------------ | ------------------------------- |
| `by_scan_at`                               | Observation-ordered feed reads. |
| `by_published_at`                          | Publication-ordered reads.      |
| `by_entity_kind_and_entity_id_and_scan_at` | Subject history.                |

### Reads and writes

- **Writes:** publish the complete output of an ingestion through the execution workflow below.
- **Reads:** Feed/Monitor reflects stored publications; ordinary cache refresh leaves claims intact.
- **Delivery:** storing a row creates no broadcast or push obligation; adapters use the
  [delivery rules](#delivery-adapters).

## Execution

The interface is input → arbitrary interpretation → published output. Start with one execution per
claimed ingestion; subject traversal, grouping, judgment and unfinished decision state remain private.

### Input selection

- Select a completed ingestion's real comparison. Baseline population supplies state, without a
  separate event comparison.
- Inspect each ingestion's `events` state; the greatest processed time alone cannot establish coverage.
- Skip completed inputs.
- Use [Ingestion's claim and concurrency protocol](ingestion.md#downstream-concurrency), whether
  invoked by the ingestion action or an independent runner.

### Steps

1. Acquire the selected ingestion's `events` claim.
2. Interpret its input and prepare the complete publication set.
3. Finish using the outcome/commit rules below.

**Interpretation inputs:** [Projections](projections.md) supplies shared meanings; Records supplies
historical context; Scan supplies original inputs where retained records are insufficient.
Interpretation can also select later completed observations explicitly.

**Starting selection:** reuse current CES lifecycle, interpreted-pricing and chosen endpoint-attribute
selection. Uninteresting differences finish silently.

**Entity lifecycle:** newly known models/providers and endpoint listing changes follow the
[entity-knowledge policy](records.md#entity-knowledge-and-availability). A model/provider's omission
from a later scan or loss of its last listed endpoint does not make that entity unlisted or unknown.

### Commit and retry

Assume the complete output fits one publication mutation, including its process-state write.

| Outcome                                    | Commit behavior                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Successful interpretation                  | Check process state once, validate and directly insert all publications, then mark Events complete and release its claim in the same mutation. |
| Successful empty output                    | Complete through the same mutation with zero inserts.                                                                                          |
| Failed execution                           | Mark Events failed and release the claim; reserve publication for successful completion.                                                       |
| Repeated publication call after completion | Observe completion and skip insertion.                                                                                                         |
| Publication mutation fails                 | Commit neither publications nor completion.                                                                                                    |

- Direct inserts require no per-event duplicate queries under this transaction-level retry rule.
- Read usage stays independent of event count; output must fit Convex argument, document and write limits.
- Execution status stays in [Ingestion's process fields](ingestion.md#process-state).

🚧 Revisit publication batching only if real output exceeds one mutation; choose its retry bookkeeping
with that change.

🚧 Future durable interpretation state belongs inside Events when an event kind requires it.
Separate comparison and pending-case tables have no current requirement.

## Delivery adapters

- Select eligible events independently, primarily from `scan_at` relative to current wall-clock time.
- Publishing historical observations today leaves them historical for delivery selection.
- Presentation and Discord adapters can share content while applying different delivery rules.
- A recent replay can still satisfy an age window; delivery deduplication remains an adapter concern.
- Alerts reuses existing subscription and transport code.

🚧 Durable external-delivery receipts belong to Alerts; implement them with the delivery workflow.
