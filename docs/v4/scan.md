# Scan

Owns capture and discovery of complete scan artifacts, and loading of the scoped dataset.

## Artifact contract

One artifact is the authoritative captured model/endpoint input at a real scan time.

### Storage

| Property     | Contract                                                                        |
| ------------ | ------------------------------------------------------------------------------- |
| Address      | `{ path: 'scans', name: 'scan.<scan_at>.jsonl' }`                               |
| Retrieval    | Existing `objects_locators` table and named-object store in `objects`           |
| Contents     | Complete captured inputs, including data outside current product scope          |
| Availability | Durable evidence for reproduction and inspection beyond retained derived fields |

Reuse the existing `scan` and object-store interfaces. Addressing, storage location and compression
remain private to this module.

### Identity and time

- Capture time is the artifact's domain identity; copies preserve it across deployments.
- All scan times are canonical UTC strings. Writers validate the format beyond `v.string()`.
- Conflicting content at the same capture time fails validation.
- Artifact availability advances independently of the [ingestion clock](ingestion.md#clock-reads).

## Loaded dataset

- Artifact loading admits models supporting both text input and text output, together with their endpoints.
- Apply this filter before provider extraction and deduplication; only admitted occurrences can select
  a provider's value.
- Downstream modules receive the same scoped dataset and take that scope as an input guarantee.
- Complete captured artifacts remain available for inspection and future derivation outside this scope.

## Operations

| Operation       | Result or completion condition                                   |
| --------------- | ---------------------------------------------------------------- |
| `capture`       | Completes after the full artifact is durable.                    |
| `next`          | Discovers the next available observation.                        |
| `load(scan_at)` | Verifies identity and returns the scoped model/endpoint records. |

A deployment can start from any selected real pair. [Initialization](ingestion.md#initialization)
uses its earlier artifact directly for the baseline.
