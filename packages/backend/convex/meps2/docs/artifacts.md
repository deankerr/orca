# Artifacts

`artifacts` maps a filename we understand to a blob. It is not scan-specific. A scan artifact
is one kind of artifact, identified by its id prefix.

## Artifact id

- The primary key is `artifact_id`, a filename as defined in [`identity.md`](identity.md).
- Insert-only. An `artifact_id` is never reused or replaced.
- A collision means a workflow reused its unique token and must fail loudly.
- Other workflows use `{workflow}.{unique}.jsonl`. For `scan`, `unique` is `scan_at`.

## Table

Each row is a locator, not a copy of the file.

- `artifact_id`
- `workflow` — denormalized from the id prefix on insert, not passed in beside it. The id wins
  if they ever disagree.
- `storage_id` — Convex file storage id
- `content_sha256` — SHA-256 of the **uncompressed** logical bytes
- `size.raw` — uncompressed byte length
- `size.blob` — stored blob byte length

There is no `format` version field. There is no `run_id`. A run may point at an artifact; an
artifact is not owned by a run.

## Storage adapter

Compression, content type, and blob transport stay inside the adapter. The rest of meps2
refers to artifacts by `artifact_id` and to contents as uncompressed JSONL bytes.

```ts
storeArtifact({ artifact_id, bytes }): Promise<{
  artifact_id: string
  storage_id: Id<'_storage'>
  content_sha256: string
  size: { raw: number; blob: number }
}>

loadArtifact(artifact_id: string): Promise<Uint8Array> // uncompressed bytes
```

- `storeArtifact` hashes `bytes`, compresses, writes the blob, then inserts the table row.
- `loadArtifact` reads the blob and decompresses. Callers parse JSONL.
- Gzip is the codec. Deterministic gzip (`mtime: 0`) so identical `bytes` produce identical
  blobs.
- 💤 zstd is a later codec change inside this adapter. It does not change `artifact_id`.
- ❓ If the table insert fails after `storage.store`, the blob is orphaned. This should not
  happen in practice. Compensation vs sweep is left open.
