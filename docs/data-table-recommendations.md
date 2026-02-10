# Data Table: Recommendations Summary

A prioritized action plan based on the full research. Each recommendation references the detailed document where the analysis lives.

## Context

The endpoints data grid has three categories of issues:
1. **DOM bloat** from per-badge popover instances (~700 mounted)
2. **React rendering overhead** from TanStack Table's mutable API disabling the React Compiler on the hot path
3. **CSS paint cost** from `backdrop-filter: blur()` on pinned columns during scroll

These compound: every scroll event triggers re-renders of ~595 cells, each of which runs `cn()` with long class strings, resolves attributes, and sits inside a popover-heavy DOM tree with active blur filters.

---

## Tier 1: High Impact, Low Effort

### 1.1 Singleton Popover for Attribute Badges
**Doc:** [data-table-popover-optimization.md](./data-table-popover-optimization.md)

Replace ~700 `Popover.Root` instances with a single shared instance using Base UI's `Popover.createHandle<T>()`. Each badge becomes a lightweight trigger with a typed payload.

- **Impact:** ~700 popover roots -> 1. Eliminates ~700 React context providers, ~700 portal containers, and ~1400 hover event listeners.
- **Effort:** Refactor `AttributeBadge` + add `AttributePopoverProvider` wrapper. ~50 lines changed.
- **Risk:** Low. Base UI's detached trigger API is stable. Test hover behavior and keyboard accessibility.

### 1.2 Replace `backdrop-blur` with Solid Backgrounds
**Doc:** [data-table-css-performance.md](./data-table-css-performance.md) Section 1

Replace semi-transparent backgrounds + blur with opaque `bg-background` + `box-shadow` on the last pinned column edge. Matches AG Grid / MUI Data Grid approach.

- **Impact:** Eliminates per-frame Gaussian blur recalculation during scroll. Fixes the visual flickering on pinned columns.
- **Effort:** Change ~4 class strings in `data-grid-table.tsx`. Add one CSS rule for box-shadow.
- **Risk:** Very low. The visual change is deliberate -- content no longer shows through pinned columns.

### 1.3 Pre-compute Static Class Strings
**Doc:** [data-table-css-performance.md](./data-table-css-performance.md) Section 2

Extract the long pinned-column class strings to module-level constants.

- **Impact:** Eliminates ~595 `tailwind-merge` parse operations per render for static strings.
- **Effort:** Move 2 strings to `const` declarations. ~5 minutes.
- **Risk:** None.

---

## Tier 2: Medium Impact, Low-Medium Effort

### 2.1 Move Pinned Column Styling to CSS
**Doc:** [data-table-css-performance.md](./data-table-css-performance.md) Section 3

The `data-pinned` and `data-last-col` attributes are already set on cells. Define their visual effects in CSS instead of computing conditional Tailwind classes in JS.

- **Impact:** Shifts 595 per-render class computations to browser CSS matching.
- **Effort:** Add ~15 lines of CSS, remove corresponding Tailwind strings from component.
- **Risk:** Low. Ensure specificity is correct.

### 2.2 Use `clsx` Instead of `cn()` for Non-Conflicting Classes
**Doc:** [data-table-css-performance.md](./data-table-css-performance.md) Section 4

Most cell classes are purely additive. `tailwind-merge` isn't needed for these.

- **Impact:** Reduces per-cell computation.
- **Effort:** Change `cn()` to `clsx()` in cell/row components after verifying no class conflicts exist.
- **Risk:** Low. If a conflict is missed, a class may not apply correctly -- but the existing classes are designed to be additive.

### 2.3 Cache Attribute Resolution
**Doc:** [data-table-audit.md](./data-table-audit.md) Issue 12

`AttributeBadgeSet` calls `definition.resolve(endpoint)` for every attribute on every render. These resolve functions access nested properties and some create arrays/objects.

- **Impact:** Prevents redundant computation when the same endpoint's attributes are resolved on re-render.
- **Effort:** Wrap in `useMemo` keyed on `endpoint._id` + relevant fields, or compute once per row and pass results down.
- **Risk:** Low.

---

## Tier 3: Medium Impact, Medium Effort

### 3.1 Narrow the `'use no memo'` Boundary
**Doc:** [data-table-alternatives.md](./data-table-alternatives.md) Section 7

Currently 6 components opt out of React Compiler. Refactor to isolate TanStack Table's mutable API in a single bridge component. Child cell renderers (EntityBadge, AttributeBadgeSet, Badge, etc.) then benefit from compiler optimization.

- **Impact:** Compiler can memoize the most expensive parts of the render tree (cell content components).
- **Effort:** Moderate refactor of `DataGridTableVirtual` to extract plain data before passing to cell renderers.
- **Risk:** Medium. The boundary between "TanStack data" and "plain data" isn't always clean -- row objects carry methods.

### 3.2 Add `contain: content` to `<td>` Elements
**Doc:** [data-table-css-performance.md](./data-table-css-performance.md) Section 5

Tell the browser each cell's layout/paint is independent.

- **Impact:** Reduces layout/paint scope. Measurable with DevTools Paint Flashing.
- **Effort:** One CSS rule.
- **Risk:** `contain: paint` clips overflow. Test cells with dropdown triggers or tooltips. (Less of an issue after the singleton popover change, since popover content is portaled.)

---

## Tier 4: Long-Term / Monitoring

### 4.1 Upgrade to TanStack Table v9 (When Stable)
**Doc:** [data-table-tanstack-react-compat.md](./data-table-tanstack-react-compat.md)

V9 targets React Compiler compatibility as a first-class goal. Migration from v8 is designed to be incremental.

- **Timeline:** H2 2026 at the earliest. Monitor alpha releases.
- **Impact:** Removes the need for `'use no memo'` entirely. Better tree-shaking (~4KB core).
- **Risk:** Timeline slippage. The rendering model compatible with the Compiler is explicitly unresolved in the v9 RFC.

### 4.2 Consider AG Grid If Requirements Grow
**Doc:** [data-table-alternatives.md](./data-table-alternatives.md) Section 1

If ORCA needs server-side filtering, column grouping, aggregation, or integrated charting, AG Grid's free tier covers all of it. The migration is expensive (~120-200KB bundle) but it's the most robust option.

---

## What Not To Do

| Approach | Why Not |
|---|---|
| Glide Data Grid | Canvas-only -- can't render React components in cells |
| react-data-grid | Perpetual v7 beta for years |
| Full DIY table | Maintenance burden exceeds ~12KB bundle savings |
| `content-visibility: auto` on rows | Breaks `position: sticky` |
| `will-change: transform` on all pinned cells | Memory cost for marginal benefit |
| CSS Grid table migration | Large refactor, marginal perf gain with only ~30 rows in DOM |

---

## Implementation Order

For maximum impact with minimum risk, implement in this order:

1. **Singleton popover** (1.1) -- largest single-item impact
2. **Replace backdrop-blur** (1.2) -- fixes visible flickering
3. **Pre-compute class strings** (1.3) -- trivial, zero risk
4. **CSS pinned column styles** (2.1) -- moves work from JS to browser
5. **`clsx` over `cn()`** (2.2) -- easy swap
6. **Attribute caching** (2.3) -- prevents redundant computation
7. **Narrow `'use no memo'`** (3.1) -- biggest architectural improvement, needs careful refactoring
8. **`contain: content`** (3.2) -- test after other changes stabilize

Items 1-3 can be done independently in parallel. Items 4-6 can follow. Item 7 is the most involved and benefits from the other changes being in place first (especially the singleton popover, which reduces the DOM complexity that the compiler has to work with).
