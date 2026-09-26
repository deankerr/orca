# Objects

Named, insert-only objects with one deployment-wide read source.

- `load(ctx, identity)` returns logical text or `null` for a missing identity.
- `loadMany(ctx, identities)` loads 1–100 exact identities in input order, retaining missing entries
  as `null`; an existing locator whose blob is missing fails the request.
- `namesAtOrAfter(ctx, { path, atOrAfter, limit })` returns up to 1–100 ordered names in that path,
  including the lower bound; an empty lower bound starts with the first name.
- `store` writes locally using `ORCA_OBJECTS_BACKEND`; deletion also targets local objects.
- The object interface owns UTF-8, gzip, storage locators and transport. Consumers receive text.

## Deployment source

Set `ORCA_OBJECTS_SOURCE_DEPLOYMENT=dependable-husky-550` on a consuming deployment to redirect
canonical reads and discovery. Leave it absent/empty on the source to read locally.
Set the same `ORCA_OBJECTS_API_KEY` on both deployments. The source must have these functions deployed
before consumers can use them; project defaults and preview initialization are configured separately.

- `objects/remote:namesAtOrAfter` is an authenticated public query over local committed locators.
- `objects/remote:loadMany` is an authenticated public action returning the original gzip bytes in
  parallel, preserving batch order. Convex serializes `v.bytes()` through its binary value encoding.
- The consumer decodes after receipt; the source neither decompresses nor recompresses blobs.
- Remote serving calls private local readers, making every request one hop even if the serving
  deployment has its own source override. A source equal to the current deployment name is rejected
  using `ctx.meta.getDeploymentMetadata()`.
- Source errors propagate without falling back to local objects. Keep the source fixed while V4
  has a populated timeline or outstanding processor work.

`v3Load` retains local-only reads for the shared V3 Scan loader and legacy `/objects` HTTP endpoint.
V3's existing locator queries and pull configuration remain independent of canonical source routing.
