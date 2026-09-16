# Raw change stream

First product slice of [Change Event Streams](change-event-streams.md).

## Purpose

- Retained exploratory tooling for the owner and coding agents.
- An admin page and programmatic interface for finding, comparing, and inspecting observations.
- Evolving output contracts are acceptable for this audience.
- Public notification presentation belongs to the separate grid overlay.

## Meaning of raw

- Raw means the shared projected catalog and its structural changes, before notification policy.
- Scope matches the grid: models with text input and text output.
- Complete before/after records accompany the changeset for contextual inspection.
- Dedicated fields carry normalized identities, names, associations, and endpoint pricing.
- Remaining fields use flattened metadata retaining JSON arrays, nulls, and empty objects.
- Status and additional pricing representations are included.
- Stats are excluded from comparison.
- Scan artifacts remain the durable source for revisiting projection decisions.

## Available mechanisms

Paths below are relative to `packages/backend/convex/`.

| Module                     | Available behavior                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------- |
| `scan/artifact.ts`         | Artifact loading and decoding; forward discovery by artifact identity.                      |
| `objects/`                 | Named-object lookup, compressed storage, and uncompressed retrieval through `/objects`.     |
| `projections/index.ts`     | Pure projection and comparison, returning source identities, complete records, and changes. |
| `projections/documents.ts` | Load a source pair and prepare an in-memory comparison.                                     |
| `v3/ingest.ts`             | Consume comparisons through views, with a reserved changeStreams call site.                 |

Comparison discovery, persisted derived documents, an inspection interface, and an admin browser are
not implemented. Current code and execution constraints are documented in the
[V3 README](../../packages/backend/convex/v3/README.md).

## Required capabilities

| Capability | Result                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Discover   | Find available observations, select a pair, and navigate history.                              |
| Compare    | Prepare the shared comparison for explicit source identities.                                  |
| Inspect    | Navigate changed owners and fields, resolve before/after context, and retrieve full documents. |

- The admin page and agents must use the same comparison implementation.
- Inspection should support focused requests without requiring every client to consume the full catalog.
- Selected source identities must remain visible so an investigation can be reproduced.
- A comparison across several intervals reports the net change, not the intermediate transitions.
- Artifact availability and the current ingested scan are distinct; pulls can leave sparse local history.

## Open decisions

| Area        | Questions and constraints                                                                  |
| ----------- | ------------------------------------------------------------------------------------------ |
| History     | Which deployment supplies observations, and how is available coverage presented?           |
| Preparation | On demand, during ingestion, or both; whether derived results need caching.                |
| Storage     | Physical layout for complete records and changes; reuse and derivation-version rules.      |
| Retrieval   | Admin/agent transport and access; server-assisted versus client-side navigation.           |
| Inspection  | Filters, pagination, owner context, and full-document downloads.                           |
| Flattening  | Resolve literal dotted-key collisions before relying on lossless flattened-key inspection. |

Named-object storage is insert-only and rejects duplicate identities. Its HTTP reader retrieves whole
objects; bounded inspection needs its own implementation.

## Local comparison

The script uses the shared projection and diff, verifies apply/revert round trips, and writes both
catalogs, the change document, and a summary:

```sh
bun run packages/scripts/change-document/index.ts <before.jsonl> <after.jsonl> <output-directory>
```

Input files are stored scan JSONL artifacts. Keep local source and output files under git-ignored
`data/` or a temporary directory.
