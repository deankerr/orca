# Glossary

Cross-cutting names. A term that exists only inside one note is defined there.

## scan

One observation of the OpenRouter catalog.

- Live fetch and file: [`module-scan.md`](module-scan.md)
- Sequence: [`module-orchestrate.md`](module-orchestrate.md)

## `scan_at`

Identity of one scan. ISO-8601 UTC from `Date.toISOString()`, e.g.
`2026-08-30T15:00:21.215Z`. Always `Z`, always three millisecond digits.
Lexicographic order is chronological and is apply order.

Assigned once, before the first upstream request. Every scan-artifact row repeats it.
Unix-ms process clocks live on the workflow component.

- ⚠️ Mixing `toISOString()` with offset strings such as `+00:00` breaks identity and
  sort.

Assigned in observe `start`.

## scan artifact

JSONL of one scan. `path` is `scan`. `artifact_id` is `scan.{scan_at}.jsonl`, the
object `name` passed to `objects`.

- Row contract: [`module-scan.md`](module-scan.md)
- Legacy producers: [`backfill.md`](backfill.md)

## `(path, artifact_id)`

Opaque object identity. `objects` calls the second field `name`.

## `ScanRef`

`{ path, artifact_id, scan_at }`. Ingest and orchestration pass this pointer.
[`module-ingest.md`](module-ingest.md).

## stored, registered, ingested

| State      | Meaning                            |
| ---------- | ---------------------------------- |
| stored     | `(path, artifact_id)` exists       |
| registered | on the ingest timeline             |
| ingested   | the ingest window covers `scan_at` |

Baseline (`before`) is the latest ingested scan. [`module-ingest.md`](module-ingest.md).

## `model_id`

Model row and model view key. Derivation: [`module-scan.md`](module-scan.md).

## endpoint `id`

Endpoint UUID. View and series key.

## Notes

| Note                                                 | Subject                             |
| ---------------------------------------------------- | ----------------------------------- |
| [`module-scan.md`](module-scan.md)                   | Live producer and file contract     |
| [`module-ingest.md`](module-ingest.md)               | Timeline and window                 |
| [`module-projections.md`](module-projections.md)     | Apply, views, series                |
| [`module-orchestrate.md`](module-orchestrate.md)     | Observe and drain                   |
| [`availability.md`](availability.md)                 | Listing / `unlisted_at`             |
| [`backfill.md`](backfill.md)                         | Legacy archives onto the timeline   |
| [`change-event-streams.md`](change-event-streams.md) | Monitor / Discord feed (undesigned) |
