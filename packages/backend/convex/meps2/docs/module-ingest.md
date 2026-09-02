# Module: Ingest

Ordered timeline of scan artifacts for one `path`. Callers pass identities, never
the JSONL. States: [`glossary.md`](glossary.md).

- Baseline (`before`) is `latest()` — the latest ingested scan. Empty window:
  empty maps.
- The ingested set is the contiguous window. Holes are unrepresentable. Register
  on either open edge; a `scan_at` strictly inside the window throws.
- ⚠️ Apply the neighbor (`nextAfter(latest)`), not an arbitrary registered id.
  Empty window: both edges are the oldest registered row, empty `before`.
- ⚠️ Register immediately after store. An older `scan_at` registered after a newer
  one ingested is interior. Observe lock is the primary guard; interior `register`
  is the last line of defense.
- ⚠️ A window bound with no scans row is corruption. Throw.

`markIngested` advances the window by exactly one neighbor. `path` is an argument;
live scan artifacts use `scan`.
