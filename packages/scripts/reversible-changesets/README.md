# Reversible JSON delta comparison

The comparison normalizes `data` and non-null `endpoints` collections to identity-keyed object maps
after parsing, then generates equivalent archives with `json-diff-ts`, `jsondiffpatch`, paired RFC
6902, and paired `obj-diff` payloads.

Generation retains the previous and current normalized bundles plus one codec payload at a time. It
writes each transition immediately rather than accumulating corpus output in memory.

```sh
bun run --cwd packages/scripts reversible-codec-comparison -- \
  --bundles-path ../../data/bundles \
  --output-path ../../data/reversible-codec-comparison

bun run --cwd packages/scripts reversible-codec-comparison-verify -- \
  --output-path ../../data/reversible-codec-comparison
```

The verifier reads every stored transition back from disk and replays each complete archive forward
and backward without retaining the transition corpus in memory.

Missing dense bundles can be synced from a configured Convex deployment with:

```sh
bun run --cwd packages/scripts sync-bundles -- \
  --backend-path ../backend \
  --bundles-path ../../data/bundles \
  --site-url https://example.convex.site \
  --since 2026-08-16
```
