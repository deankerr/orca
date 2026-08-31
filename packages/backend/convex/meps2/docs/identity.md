# Identity

A scan is identified by `scan_at`. Artifacts, ingest, view writes, and series samples all
point at that value. Process clocks live on the workflow component, not in meps2 tables.

## Scan

A **scan** is one observation of the OpenRouter catalog. `scan` is the live producer. It
is not a crawl, scrape, or snapshot-of-a-crawl.

- The data it produces is a **scan artifact**.
- A failed fetch produces no artifact.
- 🧭 `scan` does not store, register, or apply. Those are other modules.

## `scan_at`

`scan_at` is the identity of one scan attempt. It is assigned once, at the start of the
attempt, before any upstream request, and passed into `scan`.

- Format: ISO-8601 UTC from `Date.toISOString()`, e.g. `2026-08-30T15:00:21.215Z`.
- Always `Z`. Always three millisecond digits.
- Lexicographic order of the string is chronological. That order is apply order.
- It is not OpenRouter `created_at` or `updated_at`.
- It is not Convex `_creationTime`.
- It is not a workflow start time.
- Every row in a scan artifact repeats this same value.
- Per-request completion times are not recorded. The scan is one observation.
- 🧭 A new observation assigns a new `scan_at`.
- 🧭 The same attempt, including a retried fetch or store step of that attempt, reuses the
  `scan_at` already in the attempt's arguments.
- ⚠️ Do not mint `scan_at` inside a retried action if the attempt already has one.
- ⚠️ Mixing `toISOString()` with offset strings such as `+00:00` breaks both identity and
  sort.

## Artifact identity

`artifacts` identifies a blob by the opaque pair `(path, artifact_id)`. See
[`artifacts.md`](artifacts.md).

Scan's convention, assembled by `scan` (and by adapters that mint a scan artifact):

- `path` is `scan`.
- `artifact_id` is `scan.{scan_at}.jsonl`.
- Example: path `scan`, id `scan.2026-08-30T15:00:21.215Z.jsonl`.
- `.jsonl` is the logical encoding of the bytes we hash and parse.
- 🧭 Compression is not part of the id. A gzip blob and a future zstd blob are the same
  artifact.
- 🧭 `path` and `artifact_id` are not Convex document ids and are not storage locators.
- 🧭 `artifacts` does not parse `artifact_id`. The `scan.` prefix is this producer's naming
  choice, not a stored field of the blob adapter.

## Ingest identity

`ingest` records which stored scan artifacts are on the timeline and which contiguous
interval has been applied. See [`ingest.md`](ingest.md).

| State      | Meaning                                          |
| ---------- | ------------------------------------------------ |
| stored     | `(path, artifact_id)` exists in `artifacts`      |
| registered | admitted to the timeline (`ingest`)              |
| ingested   | projections applied; the window covers `scan_at` |

- **Baseline** (`before`) is the latest ingested scan artifact, not the latest stored, not
  the latest registered.
- **Earliest ingested** is the backfill bound.
- A Convex `_id` on an ingest or artifacts row is storage-local. Do not expose it as a
  scan id.

## Type split

Domain identity and process clocks are different types so they cannot be joined by accident.

| Value                      | Type             | Used for                                                                    |
| -------------------------- | ---------------- | --------------------------------------------------------------------------- |
| `scan_at`                  | string           | artifact id, scan-artifact rows, ingest, view writes, `unlisted_at`, series |
| workflow / step timestamps | number (unix ms) | attempt duration, retries. Not stored on meps2 domain tables                |

- View tables do not have `updated_at`. The last scan that wrote the row is `scan_at`.
- ⚠️ View `scan_at` is last write, not “present in the latest ingested scan.” Listing is
  the absence of `unlisted_at`. See [`views.md`](views.md).

## What is not an identifier

- A backend locator (Convex storage id, object key) is not an artifact id.
- OpenRouter model `slug` is not the scan-artifact row key. The row key is `model_id`.
- OpenRouter endpoint `id` is the endpoint UUID. It is not a model id and is not an
  artifact id.
- ⚠️ Do not name the scan-artifact row key `id`.
- ⚠️ Do not use a job/run status as the baseline pointer.
