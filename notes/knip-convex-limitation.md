# Knip + Convex: Unused Export Detection Limitation

## Problem

Knip cannot detect unused exports in Convex function files. For example, `iamunused()` and `UnusedType` in `convex/lib/env.ts` are never imported anywhere, but Knip traces them as "used."

## Root Cause

Convex's `_generated/api.d.ts` is a barrel file that re-exports every convex module via type-level namespace imports:

```typescript
import type * as lib_env from '../lib/env.js'
// ...
export type api = {
  // ...
  'lib/env': typeof lib_env
  // ...
}
```

Knip's namespace import heuristic considers all exports on a namespace "used" when the namespace object is referenced without property access (`typeof lib_env` has no property access). This marks every export of every convex module as reachable, making individual unused exports invisible.

## What We Tried

| Approach                                                   | Result                                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeEntryExports: true`                                | Reports unused exports in entry files, but not in files reachable through `_generated/api.d.ts`                                                                              |
| `ignore: ['convex/**/_generated/**']`                      | Suppresses issues in generated files, but doesn't break the import resolution chain                                                                                          |
| `project: ['!convex/**/_generated/**']`                    | Excludes from unused-file detection only; Knip still resolves imports through them                                                                                           |
| `ignoreUnresolved: ['_generated/api']`                     | Only suppresses error reports for unresolved imports; doesn't prevent resolution of existing files                                                                           |
| Removing `!**/*.d.ts` from project                         | No effect; Knip resolves `.d.ts` imports regardless of project patterns                                                                                                      |
| Custom `.d.ts` compiler stripping barrel re-exports        | Compilers run after import resolution; too late                                                                                                                              |
| Custom `.ts` compiler stripping `_generated/api` imports   | Same timing issue; Knip resolves first, compiles second                                                                                                                      |
| `ignoreIssues: ['**/_generated/**': ['exports', 'types']]` | Suppresses noise from \_generated files, but doesn't help detect unused exports in source files                                                                              |
| `include: ['nsExports', 'nsTypes']`                        | **Surfaced `iamunused` and `UnusedType`** but also reported ~70 false positives for real Convex function names accessed via the `api` namespace (e.g. `feed`, `run`, `list`) |

## Why `nsExports`/`nsTypes` Doesn't Work

Convex functions are called at runtime via `api.admin.archives.feed` — property access on the `api` namespace object. Knip sees these as namespace references without property access (because `_generated/api.d.ts` uses `typeof lib_env`), so `nsExports` flags every named export of every convex module as potentially unused. The signal-to-noise ratio makes it impractical.

## Potential Future Solutions

1. Upstream Knip feature to treat `typeof namespace` type re-exports as non-usage
2. Upstream Convex change to `_generated/api.d.ts` using individual named type imports instead of `import type * as`
3. Knip option to exclude specific import specifiers from resolution (like `ignoreUnresolved` but for reachable files)
