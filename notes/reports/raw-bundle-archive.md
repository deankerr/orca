# Raw bundle archive investigation

## SQLite representation **DRAFT**

Each immutable bundle row records:

- crawl id and original snapshot or capture metadata;
- source kind and source reference;
- source gzip size and digest;
- exact raw byte size and SHA-256 digest;
- zstd compression level, compressed size, and payload.

The primary key makes imports idempotent. Re-importing the same crawl and digest is a no-op; the
same crawl id with different bytes is an integrity failure. Update and delete triggers protect
bundle immutability. The database also carries explicit format metadata and can later add mutable
capture cursors or attempt records without weakening immutable bundle rows.

Chronological traversal casts the text crawl id to SQLite integer and is backed by an index on that
exact expression. The first implementation omitted this index, making its one-row cursor rescan and
sort the table for every bundle. That quadratic behavior looked harmless at 512 rows and stalled the
full verification. The corrected full run checked 19,245 payloads representing 169.17 GB of raw
bytes in 168.7 seconds, including an 8.5-second SQLite `integrity_check`.

Snapshot import is resumable at the individual bundle transaction boundary. An interrupted run
retains its incomplete report, append-only log, and valid SQLite prefix. Resume opens that exact
run, performs `quick_check`, validates the archive format, restores the original input/compression/
limit policy from the report, and skips rows whose source identity and sizes already match. Rows
that do not match are re-encoded and subjected to the raw-digest duplicate rule. A complete payload
and SQLite integrity pass remains the publication gate. Before that pass, snapshot imports also
reconcile the complete ordered crawl set and its source metadata so internally valid but missing or
unexpected rows cannot be published.

Expected failure behavior:

- interruption during gzip/zstd work leaves no row for that bundle;
- interruption during insertion leaves either the complete row or no row through SQLite atomicity;
- disk, source-read, or codec errors produce a failed resumable report when Effect can handle the
  failure; an abrupt process signal may leave `running`, which is also considered resumable;
- a second writer refuses to resume a run whose recorded importer process is still active;
- a missing or incompatible database, failed `quick_check`, changed import limit, divergent raw
  digest, or attempt to resume a successful run fails before publication;
- interruption during final verification does not change stored evidence and the next attempt can
  skip import work before verifying again.

A replay reads one row at a time in ascending crawl order, decompresses and verifies one payload,
parses one bundle, commits one product transition, then releases that bundle. Historical precision
is a read policy selected from archive metadata; the raw archive always retains full precision.

Daily replay structurally inspects every bundle but defers core schema decoding and endpoint-model
deduplication until after selecting the final usable candidate for each UTC day. This preserves
fallback when a day's final observation is unusable while retaining at most one candidate. On the
19,245-bundle archive, moving full materialization after selection reduced replay from 1,220.3 to
798.8 seconds. Selected-candidate materialization took 8.1 seconds; raw JSON inspection remained the
largest measured stage at 599.1 seconds. The resulting database is row-for-row identical to the
pre-refactor macOS database across every table.

## Incremental catch-up

The production snapshot establishes an imported watermark. A Convex synchronizer should then:

1. page archive metadata strictly after an overlapping crawl id;
2. fetch each gzip bundle by crawl id;
3. decompress, hash, zstd-compress, and insert it atomically;
4. treat a matching existing digest as success and a divergent digest as corruption;
5. retain failed fetch attempts explicitly and advance its durable cursor only across accounted-for
   metadata;
6. continue polling while the replacement capture system is developed;
7. overlap old and replacement capture at cutover and compare evidence before retiring Convex.

The current backend exposes specific-crawl bundle downloads and paginated archive metadata, but an
ascending `after crawl_id` feed would make this synchronization contract clearer and cheaper.

## Framed pack direction

If a single SQLite archive later becomes operationally awkward, the same logical contract can be
stored as immutable framed packs, particularly in R2:

```text
pack header
  record header: crawl id, raw size, compressed size, raw digest
  independent zstd frame containing exact raw JSON bytes
  record header
  independent zstd frame
  ...
pack footer or immutable sidecar index
```

Packs should be bounded by bytes or record count and sealed atomically. Active capture writes a
small tail and periodically seals it; readers traverse sealed packs and then the tail in one
direction. Independent frames preserve bounded memory and allow recovery to the last complete
record. Content-derived pack names and per-record digests make orphan reconciliation possible
after a crash.

This design offers immutable object storage, straightforward replication, and genuinely sequential
I/O. Its costs are a custom framing specification, index and reconciliation logic, tail sealing,
and more complex idempotency. The storage interface must therefore expose ordered bundles rather
than SQLite details so packs can replace the local adapter if evidence justifies them.

## Why not `Bun.Archive`

In Bun 1.3.14, `Bun.Archive` creates tar archives and optionally gzip-compresses them. It has no
append API or zstd output. Its `files()` reader loads entry contents into memory, while `extract()`
writes to disk; neither is a forward entry stream suitable for direct product replay. Native
archive creation may still be useful for bounded exports, but it does not provide the growing raw
store needed here.

Bun's zstd `CompressionStream` can create a bounded streaming frame. Empirically, Bun's
`DecompressionStream("zstd")` reads only the first of concatenated frames, even though
`Bun.zstdDecompressSync` accepts concatenated frames. A future pack reader should therefore know
record/frame boundaries instead of depending on transparent concatenated-stream decoding.
