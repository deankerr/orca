# Identity

A scan is identified by `scan_at`. Artifacts, view writes, and series samples all point at that
value. Runs have a separate clock.

## Scan

A **scan** is the workflow that fetches OpenRouter and produces one observation of the catalog.

- The workflow name is `scan`.
- 🧭 Never call this a crawl, scrape, or snapshot-of-a-crawl.
- The data it produces is a **scan artifact**.
- A failed fetch produces no artifact.

## `scan_at`

`scan_at` is the identity of one scan attempt. It is assigned once, at the start of the attempt,
before any upstream request.

- Format: ISO-8601 UTC from `Date.toISOString()`, e.g. `2026-08-30T15:00:21.215Z`.
- Always `Z`. Always three millisecond digits.
- Lexicographic order of the string is chronological.
- It is not OpenRouter `created_at` or `updated_at`.
- It is not Convex `_creationTime`.
- It is not the run's `started_at` / `completed_at`.
- Every row in a scan artifact repeats this same value.
- Per-request completion times are not recorded. The scan is one observation.
- ⚠️ Two attempts never share a `scan_at`. A retry is a new scan.
- ⚠️ Mixing `toISOString()` with offset strings such as `+00:00` breaks both identity and sort.

## Artifact identity

`artifacts` identifies a blob by the opaque pair `(path, artifact_id)`. See
[`artifacts.md`](artifacts.md).

Scan's convention:

- `path` is `scan`.
- `artifact_id` is `scan.{scan_at}.jsonl`.
- Example: path `scan`, id `scan.2026-08-30T15:00:21.215Z.jsonl`.
- `.jsonl` is the logical encoding of the bytes we hash and parse.
- 🧭 Compression is not part of the id. A gzip blob and a future zstd blob are the same artifact.
- 🧭 `path` and `artifact_id` are not Convex document ids and are not storage locators.
- 🧭 `artifacts` does not parse `artifact_id`. The `scan.` prefix is this workflow's naming
  choice, not a stored field.

## Type split

Domain identity and process clocks are different types so they cannot be joined by accident.

| Value                        | Type             | Used for                                                                   |
| ---------------------------- | ---------------- | -------------------------------------------------------------------------- |
| `scan_at`                    | string           | artifact id, scan-artifact rows, view writes, `unlisted_at`, pricing/stats |
| `started_at`, `completed_at` | number (unix ms) | run duration, stale-run takeover                                           |

- View tables do not have `updated_at`. The last scan that wrote the row is `scan_at`.
- ⚠️ View `scan_at` is last write, not “present in the latest applied scan.” Listing is the
  absence of `unlisted_at`. See [`views.md`](views.md).

## What is not an identifier

- Convex `_id` on an artifacts or runs row is storage-local. Do not expose it as a scan id.
- A backend locator (Convex storage id, object key) is not an artifact id.
- OpenRouter model `slug` is not the scan-artifact row key. The row key is `model_id`.
- OpenRouter endpoint `id` is the endpoint UUID. It is not a model id and not an artifact id.
- ⚠️ Do not name the scan-artifact row key `id`.
