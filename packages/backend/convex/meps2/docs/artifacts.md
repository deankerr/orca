# Artifacts

`artifacts` stores and loads named blobs. Callers pass uncompressed bytes and an identity.
The storage backend is not part of the interface. This module does not know about ingest,
projections, or orchestration.

## Identity

An artifact is identified by the pair `(path, artifact_id)`. Both values are caller-provided
and opaque. The module does not parse them, join them, or derive one from the other.

- `path` — grouping prefix. An object-storage backend uses it as the key prefix.
- `artifact_id` — object name within that path. Scan's filename convention lives in
  [`identity.md`](identity.md); this module does not enforce it.
- Compression is not part of the identity. A gzip blob and a future zstd blob are the same
  artifact.
- There is no `list`. Timeline queries belong to `ingest`.
- Locator fields (`storage_id`, future object key) are not on the interface.

## Interface

```ts
store({ path, artifact_id, bytes }): Promise<{
  path: string
  artifact_id: string
  content_sha256: string
  size: { raw: number; blob: number }
}>

load({ path, artifact_id }): Promise<Uint8Array>
```

- `bytes` in and out are the uncompressed logical bytes.
- `content_sha256` is SHA-256 of those bytes.
- `size.raw` is that byte length. `size.blob` is the stored blob length after the backend
  codec.
- `load` throws if the pair is missing.
- Locators, content type, and codec stay inside the module.

## Locator row

The Convex backend keeps one locator row per pair. Callers of `store` / `load` do not read
this table.

- Fields: `path`, `artifact_id`, `storage_id`, `content_sha256`, `size.{raw,blob}`.
- No ingest fields. No `scan_at`. No status.
- Index `by_path_artifact_id` on `['path', 'artifact_id']`. Reads use `.unique()`.
- Index `by_path` on `['path']` exists for maintenance (sweep), not for baseline.

## `store` mutation path

`store` is an action (blob write) plus a locator mutation.

1. Hash `bytes`. Gzip with `mtime: 0`.
2. Read `by_path_artifact_id` `.unique()`.
3. If a row exists and `content_sha256` equals the hash of these `bytes`, return that row's
   identity and sizes. Do not write a second blob.
4. If a row exists and the hash differs, throw. The pair is taken.
5. If no row exists, write the blob, then insert the locator row with that `storage_id`.

- 🧭 Same pair + same digest is success. A retried store step of the same attempt must not
  fail because the first attempt already committed the locator.
- 🧭 Same pair + different digest is a conflict. Do not overwrite.
- 🧭 There is no upsert of locator fields other than the first insert.
- ❓ If the locator insert fails after the blob write, the blob is orphaned. Compensation
  vs sweep is left open. A retry may write a second blob and then insert; the orphan remains.

## `load`

1. Read `by_path_artifact_id` `.unique()`.
2. If no row, throw. Missing pair, not empty bytes.
3. Fetch the blob by `storage_id`. If the blob is gone, throw with the locator id in the
   error data.
4. Gunzip and return uncompressed bytes.

## Backend

The current backend is Convex file storage. A later backend (R2, both, something else)
implements the same `store` / `load` contract.

- Gzip is the codec. Deterministic gzip (`mtime: 0`) so identical `bytes` produce identical
  blobs.
- 💤 zstd is a later codec change inside the backend. It does not change identity.

Callers never see a Convex storage id, an R2 key, or a content type.
