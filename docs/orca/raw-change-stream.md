# Raw change stream

Exploratory tooling using the shared comparisons that will also support
[Change Event Streams](change-event-streams.md).

## Purpose

- Retained exploratory tooling for the owner and coding agents.
- An admin page and programmatic interface for finding, comparing, and inspecting observations.
- Evolving output contracts are acceptable for this audience.
- Public notification presentation belongs to the separate grid overlay.
- The initial workflow is chronological exploration rather than cross-history search.
- Unexpected product values can prompt inspection of their projected source values.

## Initial direction

- Comparisons are computed on demand without persisted results or background preparation.
- The comparison interface accepts explicit scan artifact identities, independently of ingestion.
- Ingestion records provide a useful chronological index for stepping through source pairs.
- Artifact availability determines whether a selected pair can be compared on this deployment.
- Selecting the `from` of one ingestion and the `to` of a later ingestion gives a wider-period diff.
- The browser and agents share preparation; focused output can be shaped by local scripts or `jq`.
- Purpose-built investigations can produce text, tables, or other views without expanding the browser.
- This tool does not consume ingestion work or advance the ORCA clock.
- Persisting comparisons as receipts or for faster retrieval remains optional future work.

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
| `scan/inspection.ts`       | Paginated ingestion index and on-demand comparisons for the browser and CLI.                |
| `objects/`                 | Named-object lookup, compressed storage, and uncompressed retrieval through `/objects`.     |
| `projections/index.ts`     | Pure projection and comparison, returning source identities, complete records, and changes. |
| `projections/documents.ts` | Load a source pair and prepare an in-memory comparison.                                     |
| `v3/ingest.ts`             | Consume comparisons through views, with a reserved changeStreams call site.                 |

The admin browser is available at `/admin/changes`; comparison results are not persisted server-side.
Current execution constraints are documented in the [V3 README](../../packages/backend/convex/v3/README.md).

## Interface

- `scan/inspection:ingestions` is a paginated query over ingestion records, newest ingestion first.
- Each index entry includes both source identities and their local locator availability.
- `scan/inspection:compare` is a public action accepting `fromArtifactId` and `toArtifactId`.
- A null `fromArtifactId` selects the empty initial catalog; other identities name stored artifacts.
- The action returns JSON text to preserve key order; callers parse it before inspecting the result.
- The parsed result contains the shared `document` and a null `owner` for an unfiltered comparison.
- An optional `owner: { collection, id }` scopes changes and includes complete before/after records.
- Owner collections are `models`, `providers`, and `endpoints`; absence on either side is null.
- Missing artifacts fail explicitly, while unchanged owners return context with an empty changeset.
- Pair comparisons load the selected sources rather than replaying intervening observations.
- These interfaces have no authentication requirement.

Run from `packages/backend`:

```sh
bunx convex run scan/inspection:ingestions \
  '{"paginationOpts":{"numItems":25,"cursor":null}}'

bunx convex run scan/inspection:compare \
  '{"fromArtifactId":"scan.2026-09-15T05:40:04.053Z.jsonl","toArtifactId":"scan.2026-09-16T05:40:04.224Z.jsonl"}' | jq -r .

bunx convex run scan/inspection:compare \
  '{"fromArtifactId":null,"toArtifactId":"scan.2026-09-16T05:40:04.224Z.jsonl","owner":{"collection":"models","id":"openai/gpt-4o"}}' | jq -r .
```

## Browser

- Opening `/admin/changes` selects the newest available pair in the loaded ingestion index.
- The URL pins the selection through `from`, `to`, `collection`, and `id`, managed by nuqs.
- `from=initial` represents the empty catalog; explicit pairs work outside the loaded index.
- Older/newer controls step through loaded ingestions, and the index can load older pages.
- New index entries leave the selected pair in place; Latest explicitly moves to the newest pair.
- Pair and owner edits submit together; collection-only filtering uses the loaded document.
- Results are plain formatted JSON with copy, download, error, and explicit refresh controls.
- Comparisons use a page-local memory cache without focus, reconnect, or mount refetching.
- The index is reactive; comparisons are actions and stay out of the app's persisted query cache.

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
- A net comparison transforms the earlier projected catalog into the later projected catalog.
- Replaying intermediate scans can produce different retained view rows, historical series, and stats.
- Artifact availability and the current ingested scan are distinct; pulls can leave sparse local history.
- Recomputing with changed projection code can change results for the same source identities.

## Open decisions

| Area        | Questions and constraints                                                                    |
| ----------- | -------------------------------------------------------------------------------------------- |
| History     | Which deployment supplies observations, and how is available coverage presented?             |
| Preparation | How should on-demand preparation support responsive browsing and bounded agent responses?    |
| Storage     | Would measured latency or a receipt requirement justify persistence and derivation versions? |
| Retrieval   | Admin/agent transport and access; server-assisted versus client-side navigation.             |
| Inspection  | Step navigation, pair selection, within-comparison filters, context, and document downloads. |
| Flattening  | Resolve literal dotted-key collisions before relying on lossless flattened-key inspection.   |

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
