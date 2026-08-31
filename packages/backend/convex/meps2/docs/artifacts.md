# Artifacts

`artifacts` stores and loads named blobs. Callers pass uncompressed bytes and an identity. The
storage backend is not part of the interface.

## Identity

An artifact is identified by the pair `(path, artifact_id)`. Both values are caller-provided and
opaque. The module does not parse them, join them, or derive one from the other.

- `path` — grouping prefix. An object-storage backend uses it as the key prefix.
- `artifact_id` — object name within that path. Scan's filename convention lives in
  [`identity.md`](identity.md); this module does not enforce it.
- Insert-only. Reusing a pair fails.
- Compression is not part of the identity. A gzip blob and a future zstd blob are the same
  artifact.

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
- `size.raw` is that byte length. `size.blob` is the stored blob length after the backend codec.
- `load` throws if the pair is missing.
- Locators, content type, and codec stay inside the module.

## Backend

The current backend is Convex file storage. A later backend (R2, both, something else) implements
the same `store` / `load` contract.

- Gzip is the codec. Deterministic gzip (`mtime: 0`) so identical `bytes` produce identical blobs.
- 💤 zstd is a later codec change inside the backend. It does not change identity.
- ❓ If the locator write fails after the blob write, the blob is orphaned. This should not happen
  in practice. Compensation vs sweep is left open.

Callers never see a Convex storage id, an R2 key, or a content type.
