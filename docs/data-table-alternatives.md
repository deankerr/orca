# Data Table: Alternative Libraries & Approaches

Evaluation of replacement/complementary approaches for the endpoints data grid.

## Requirements Summary

- ~5000 rows with row virtualization
- 17 columns with complex cell renderers (icon badges, avatars, formatted prices)
- Column pinning (2 pinned left)
- Column resizing
- Sorting + fuzzy text search
- React 19 + React Compiler compatible
- Next.js 16 (App Router), Tailwind CSS 4, dark theme

---

## 1. AG Grid Community (Free, MIT)

**The only fully batteries-included option that covers all requirements.**

### What's Free

Everything ORCA needs: column pinning, resizing, sorting, filtering, custom cell renderers, row/column virtualization, theming. Enterprise-only features (pivoting, grouping, aggregation, Excel export, charting) are not needed.

### React 19 / Compiler

- React 19.2 support added in v34.3+ (October 2025)
- Uses its own native React rendering engine internally -- largely immune to React Compiler issues
- One known bug: [pinned bottom row not updating with the Compiler](https://github.com/ag-grid/ag-grid/issues/12170) (October 2025)

### Strengths

- Battle-tested at scale: handles millions of rows
- Pinned columns use separate scroll containers (not CSS sticky) -- avoids all the backdrop-blur/flicker issues
- Active maintenance with major releases every 2-3 months
- ~13K GitHub stars, massive commercial user base

### Weaknesses

- **Bundle size**: ~120-200KB gzipped (vs ~20KB current). Modular imports help but it's still 6-10x larger.
- **Opinionated**: You lose control over HTML structure. The grid owns the DOM.
- **Tailwind integration**: AG Grid has its own CSS system. Custom cells can use Tailwind, but the grid chrome (headers, scrollbars, borders) requires AG Grid's theming.
- **Migration effort: HIGH** -- complete rewrite of the data grid layer, all 17 column definitions, cell renderers need AG Grid-compatible wrappers.

### Verdict

Worth evaluating if ORCA's grid requirements grow significantly. For current needs, the migration cost and bundle size increase are hard to justify.

---

## 2. Glide Data Grid (Canvas-based)

**Not viable for this use case.**

Glide Data Grid renders everything to HTML Canvas. Custom cells must be drawn with Canvas 2D API (`ctx.fillRect()`, `ctx.drawImage()`, `ctx.fillText()`). The maintainer stated explicitly: "No way to do that efficiently. If you need HTML I suggest using something else."

ORCA's cell renderers (EntityBadge with React avatar components, AttributeBadgeSet with hover popovers, styled Badge components) cannot be rendered on Canvas without complete rewrites. The library also hasn't had an npm release in ~2 years.

---

## 3. React Data Grid (adazzle/Comcast)

**Viable but risky due to perpetual beta.**

- Latest: v7.0.0-beta.59 (has been in v7 beta for years)
- Claims React 19+ support
- Full React component custom cells, column pinning, resizing, sorting
- Small bundle (single dependency: `clsx`)
- Move to Comcast's org suggests continued backing, but pace is slow

**Migration effort: MEDIUM-HIGH.** Less control over rendering than current headless approach.

---

## 4. TanStack Table v9

**The natural upgrade path, when it ships.**

V9 addresses the React Compiler incompatibility as a first-class goal. Migration from v8 is designed to be incremental (`useReactTable` -> `useTable`, explicit feature imports). Core bundle drops to ~4KB.

**But**: The rendering model compatible with the Compiler is explicitly unresolved. Stable release is H2 2026 at the earliest. See [data-table-tanstack-react-compat.md](./data-table-tanstack-react-compat.md) for details.

---

## 5. Custom Virtual Table (DIY with @tanstack/react-virtual)

**A legitimate option if React Compiler compatibility is the primary driver.**

### What You Keep

- `@tanstack/react-virtual` for windowed rendering (~5KB)
- `@tanstack/match-sorter-utils` for fuzzy search (~3KB)
- Total: ~8KB gzipped

### What You Implement

| Feature | Effort |
|---|---|
| Sorting | `Array.sort()` + `useMemo`, ~50 lines |
| Filtering | `Array.filter()` + `useMemo`, ~30 lines (already done in `useEndpointsData`) |
| Column model | Custom `ColumnDef` type, ~200-300 lines |
| Column resizing | Mouse/touch event handlers + width state, ~100 lines |
| Column pinning | CSS `position: sticky` with manual offset calculation (already done) |
| Column visibility | Boolean map + filter, trivial |

ORCA already does its own pre-filtering before TanStack Table (`useEndpointFilters`). The table's `getFilteredRowModel()` only handles fuzzy search, and `getSortedRowModel()` wraps `Array.sort()`.

### React Compiler

Fully compatible -- you control all state management. No interior mutability. However, `useVirtualizer` itself is still on the incompatible libraries list.

### Risk

Accumulating subtle bugs that TanStack Table already handles (edge cases in multi-column sorting, resize interaction with pinning, column width calculations). The ~12KB bundle savings may not justify the maintenance burden.

---

## 6. CSS-Based Solutions (Incremental)

### `content-visibility: auto`

Not viable as primary virtualization for 5000 rows with complex renderers. Breaks `position: sticky`. Better suited for simpler, smaller lists.

### CSS Grid as Table Replacement

CSS Grid with `display: contents` on `<tr>` is architecturally viable and is the direction modern data grids are moving. Benefits for column pinning (natural sticky support) and virtualization. However:
- `display: contents` strips table accessibility semantics (needs ARIA roles)
- Migration from `<table>` is significant
- Performance difference is marginal with only ~30 rows in the DOM

### CSS Subgrid

Not needed given `table-fixed` layout with explicit column widths already achieves alignment.

---

## 7. Headless Boundary Approach (Recommended Short-Term)

**Keep TanStack Table v8, but isolate the incompatibility boundary.**

Instead of `'use no memo'` on every cell/row component, isolate TanStack Table usage into a single bridge component:

```tsx
function TableBridge({ data, columns, sorting, globalFilter }) {
  'use no memo'
  const table = useReactTable({ data, columns, ... })

  // Extract plain data the compiler can work with
  const rows = table.getRowModel().rows
  const headerGroups = table.getHeaderGroups()

  return <TableRenderer rows={rows} headerGroups={headerGroups} />
}

// This component and all its children benefit from React Compiler
function TableRenderer({ rows, headerGroups }) {
  // Render with @tanstack/react-virtual
  // Cell components receive plain props, not table instance methods
}
```

**Benefits:**
- `'use no memo'` scope narrows from 6 components to 1
- All cell renderers (EntityBadge, AttributeBadgeSet, etc.) become compiler-optimized
- No library migration
- Low effort

**Limitation:** TanStack Table row/cell objects passed to children still have the mutable API. To fully benefit, you'd extract only the primitive values needed for rendering. This is more invasive but still less work than a full library swap.

---

## Comparison Matrix

| Criterion | AG Grid | Glide Data Grid | react-data-grid | TanStack v9 | Custom DIY | CSS Solutions | Headless Boundary |
|---|---|---|---|---|---|---|---|
| **React Compiler** | Mostly works | N/A (canvas) | Unknown | Goal (unsolved) | Fully compatible | N/A | Partial (bridge) |
| **Bundle (gzip)** | ~120-200KB | ~50KB | ~15-20KB | ~4-10KB | ~8KB | 0KB | ~20KB (current) |
| **Custom Cells** | React components | Canvas 2D only | React components | React components | React components | React components | React components |
| **Maintenance** | Excellent | Stale | Slow beta | Delayed | Self-maintained | Browser-native | Self-maintained |
| **Migration Effort** | HIGH | VERY HIGH | MEDIUM-HIGH | LOW-MEDIUM | MEDIUM | LOW | LOW |
| **Risk** | Bundle size, lock-in | Dead project | Perpetual beta | Timeline slip | Maintenance burden | Limited scope | Still on TT v8 |

## Recommendations

### Now: Headless Boundary Approach
Narrow the `'use no memo'` scope. Extract plain data at the bridge, let compiler optimize cell renderers. Combine with the CSS/popover optimizations from the other research docs.

### When TanStack Table v9 Ships: Upgrade
The migration is incremental and solves the core architecture issue. Monitor the alpha releases.

### If Requirements Grow Significantly: Evaluate AG Grid
If ORCA needs server-side filtering, column grouping, integrated charting, or other enterprise features, AG Grid's free tier covers all of it. The migration is expensive but AG Grid is the most robust option.

### Avoid
- Glide Data Grid (canvas-only, stale)
- react-data-grid (perpetual beta)
- `content-visibility: auto` as virtualization replacement (breaks sticky)
- Full DIY table (maintenance burden exceeds savings)
