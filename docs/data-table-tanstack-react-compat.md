# TanStack Table + React 19 / React Compiler: Compatibility Analysis

## The Core Problem: Interior Mutability

TanStack Table v8's `useReactTable` returns a **mutable object** that maintains the same reference identity while its internal state changes. React Compiler assumes that if a reference hasn't changed, its contents haven't changed, and skips re-rendering. This assumption is fundamentally violated by TanStack Table's architecture.

React's documentation explicitly names TanStack Table as an incompatible library:

> `useReactTable` -- "table instance uses interior mutability"

When the compiler transforms code like `const rows = table.getRowModel().rows`, it may memoize the result based on the `table` reference. Since `table` is always the same object, the compiler caches stale values and the UI never updates.

## Documented Issues

- **[TanStack/table #5567](https://github.com/TanStack/table/issues/5567)** -- "Table doesn't re-render with new React Compiler + React 19." Adding rows fails to trigger visual updates.
- **[TanStack/table #5903](https://github.com/TanStack/table/issues/5903)** -- "Sorting not working if React Compiler is set." Setting `reactCompiler: true` in `next.config.ts` breaks sorting.
- **[facebook/react #33057](https://github.com/facebook/react/issues/33057)** -- "React Compiler breaks most functionality of TanStack Table." Filed as a compiler bug.
- **[TanStack/table #4794](https://github.com/TanStack/table/issues/4794)** -- `cell.getContext()` creates new objects every call, defeating `React.memo()`.

## Why `'use no memo'` Is Required

The ORCA codebase uses `'use no memo'` in 6 components on the render hot path. These components call TanStack Table methods like `.getIsPinned()`, `.getIsLastColumn()`, `.getCanPin()`, `table.getRowModel()`, `row.getVisibleCells()` -- all of which return computed values from the mutable table instance. Without `'use no memo'`, the compiler caches stale return values, producing stale UI.

## Methods That Return New Objects Every Call

| Method | Returns | Impact |
|---|---|---|
| `cell.getContext()` | New `{ table, column, row, cell, getValue, renderValue }` every call | Defeats `React.memo()` on all cell components |
| `row.getVisibleCells()` | New array every call | 17 new objects per row per render |
| `table.getAllColumns()` | New object every call | Confirmed in [Discussion #4845](https://github.com/TanStack/table/discussions/4845) |
| `table.getRowModel()` | New object | ~30ms for 10K rows regardless |

## `flexRender` Performance

`flexRender` calls `cell.getContext()` internally, creating a new context object per cell. Measurements from issue #4794:

- **50 rows**: 14.4ms rerender when a single cell changes
- **1,000 rows**: 136ms rerender (85ms with manual memoization workarounds)
- **Svelte (issue #4962)**: Sorting 1,000 rows took ~4 seconds with `flexRender()`, instantaneous without

## The `eslint-disable react-hooks/incompatible-library` Comment

This is the React Compiler's lint rule that warns when code uses APIs from libraries known to be incompatible with memoization. ORCA suppresses it in 4 locations (`useReactTable` and `useVirtualizer` calls). The compiler auto-detects these and silently skips memoization for affected components.

Note: [facebook/react #35105](https://github.com/facebook/react/issues/35105) documents a bug where an unrelated `eslint-disable` comment can inadvertently suppress this warning, making the compiler silently skip memoization without any visible indicator.

## TanStack Table v9 Status

V9 is **in alpha** with key planned changes:

- **Modular architecture**: Core drops from ~14-20KB to ~4KB with tree-shaking
- **API refactoring**: Methods become importable pure functions instead of instance methods
- **React Compiler compatibility**: Listed as a first-class goal, but explicitly acknowledged as **unsolved**: "We haven't figured out a rendering model compatible with the compiler yet. Help is wanted."
- **Plugin system**: All features treated as plugins via `_features` option
- **TanStack Store**: Planned replacement for internal state management

**Timeline reality**: Lead maintainer Kevin Van Cott stated in late 2025: "After not being able to dedicate as much time in 2025... It's going to be a challenge to actually organize and ship everything in 2026." Stable v9 is **H2 2026 at the earliest**.

Important: The v9 RFC reveals that state management and rendering logic remain unchanged from v8 in the initial release. Fine-grained re-rendering is not planned initially.

## Memory Optimization (PR #5927)

A merged PR moves duplicate row instance methods to a shared prototype:
- Memory: 136MB to 4.8MB for 50K×5 table (28x improvement)
- Row access: 132ms to 18ms (7x faster)
- **Trade-off**: Destructuring row methods breaks. Deferred to v9.

## Strategic Implications for ORCA

1. **Short-term**: The `'use no memo'` approach is the correct workaround and matches TanStack's recommendation
2. **The fundamental tension is architectural**: TanStack Table's mutable instance pattern is incompatible with React's rendering model. This cannot be fixed with configuration changes.
3. **v9 upgrade** is the natural long-term path but timeline is uncertain
4. **Isolation boundary** approach (wrap TanStack Table usage in a single `'use no memo'` bridge, pass plain data to compiler-optimized child components) offers the best short-term improvement
