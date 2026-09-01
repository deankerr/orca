# Module: Artifacts

Opaque `(path, artifact_id)` blob store. Callers pass uncompressed bytes. Insert-only:
a taken pair throws. Locators and gzip stay inside the module. Timeline queries are
`ingest`.

- ⚠️ `load` of a missing pair throws.
- ❓ Blob written, locator insert failed, no row: orphan. Compensation vs sweep is
  open.
- 💤 zstd is a later codec change. Identity stays the pair.
