# Backfill

Production crawl archives become scan artifacts through an adapter, then store
and register like any other observation. Drain applies them onto the views.

- 🚧 The adapter is not built. Same row contract as live `scan`. `scan_at` is the
  source observation time (`crawl_at` on `model-endpoints-v1`).
- Register on the open earliest edge. A `scan_at` strictly inside the ingested
  window throws.
- ⚠️ Nearest-older-first when the window is already non-empty. Oldest-first makes
  intervening `scan_at` interior.
- Archives that must precede live ingest are registered before the first live
  ingest.
- 💤 Reverse-time apply of an older-than-earliest artifact against the current
  view.
