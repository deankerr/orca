# Data Table: Current State Audit

An analysis of the current endpoints data grid implementation, covering architecture, performance characteristics, and identified issues.

## Architecture Overview

### Component Hierarchy

```
EndpointsDataGrid (page.tsx)
  └─ DataGrid (data-grid.tsx)               — Context provider, merges layout config
       └─ DataGridProvider                   — React Context: table, props, isLoading
            └─ DataGridCard                  — Outer card shell
                 ├─ DataGridCardToolbar
                 │    └─ DataGridControls    — Search input + attribute filter toggles
                 ├─ DataGridCardContent
                 │    └─ DataGridTableVirtual — Virtualized table renderer
                 └─ DataGridCardFooter
                      └─ DataGridFooter      — Record count display
```

### Libraries & Versions

| Library | Version | Role |
|---|---|---|
| `@tanstack/react-table` | ^8.21.3 | Table state: sorting, filtering, column model, pinning, resizing |
| `@tanstack/react-virtual` | ^3.13.18 | Row virtualization |
| `@tanstack/match-sorter-utils` | ^8.19.4 | Fuzzy text search/ranking |
| `@radix-ui/react-scroll-area` | ^1.2.10 | Custom scrollbar (non-touch) |
| `@base-ui-components/react` | ^1.0.0-rc.0 | Popover (attribute badge tooltips) |
| `class-variance-authority` | ^0.7.1 | Variant-based CSS class generation |
| `nuqs` | ^2.8.6 | URL query state for filters/sorting |
| React | 19.2.3 | With React Compiler (babel plugin 1.0.0) |

### Data Flow

```
Convex DB ──[React Query]──> rawEndpoints (Doc<'or_views_endpoints'>[])
  │
  └──[useMemo + attributeFilters]──> filteredEndpoints
       │
       └──[useReactTable]──> TanStack Table instance
            │
            ├── getCoreRowModel()
            ├── getSortedRowModel()
            ├── getFilteredRowModel()    (fuzzy search)
            └── columnPinning state
                 │
                 └──[useVirtualizer]──> Virtual rows (visible window only)
                      │
                      └── DOM: <table> with padding rows + visible rows
```

### Configuration

The endpoints grid uses these layout options:

```ts
tableLayout: {
  headerSticky: true,      // position: sticky on thead
  headerBorder: true,      // Absolute-positioned bottom border (stays with sticky)
  width: 'fixed',          // table-fixed layout
  cellBorder: true,        // Right borders between cells
  rowHeight: 57,           // Estimated row height for virtualizer
  overscan: 20,            // Extra rows rendered above/below viewport
  columnsResizable: true,
  columnsPinnable: true,   // model + provider pinned left
}
```

---

## Column Inventory

17 columns total. Each cell renders differently:

| Column | Width | Cell Renderer | DOM Complexity |
|---|---|---|---|
| model | 260px | `EntityBadge` (avatar + name + slug button) wrapped in `EntitySheetTrigger` | High: Image, 2 text nodes, button, sheet trigger |
| provider | 230px | `EntityBadge` wrapped in `EntitySheetTrigger` | High: same as model |
| status | 110px | `AttributeBadgeSet` (mode=first) — up to 3 attrs | Medium: 0-1 badge with popover + sprite icon |
| inputPrice | 120px | `formatPrice()` — text | Low: text node |
| outputPrice | 120px | `formatPrice()` — text | Low: text node |
| modalities | 160px | `AttributeBadgeSet` (mode=compact) — 6 attrs | High: 0-6 badges, each with popover + sprite icon |
| features | 254px | `AttributeBadgeSet` (mode=grid) — 7 slots | High: 7 elements (badges or placeholder divs), each badge has popover + icon |
| contextLength | 135px | `toLocaleString()` | Low: text node |
| maxOutput | 135px | `toLocaleString()` | Low: text node |
| quantization | 120px | `<Badge>` with text | Low: single badge |
| throughput | 125px | `toLocaleString()` | Low: text node |
| latency | 105px | `toLocaleString()` | Low: text node |
| miscPricing | 105px | Manual `AttributeBadge` rendering | Medium: 0-N badges |
| dataPolicy | 150px | `AttributeBadgeSet` (mode=compact) — 4 attrs | Medium: 0-4 badges |
| limits | 150px | `AttributeBadgeSet` (mode=compact) — 5 attrs | Medium: 0-5 badges |
| modelAddedAt | 120px | `formatDateTime()` text | Low: text node |
| unavailableAt | 135px | `formatDateTime()` text | Low: text node |

---

## Identified Issues

### 1. Popover-Per-Badge: Massive Hidden DOM Tree

**Severity: High — Primary performance concern**

Every `AttributeBadge` mounts a full Base UI `Popover.Root` with `Popover.Portal`. Each badge includes:
- A `Popover.Root` (context provider + state)
- A `Popover.Trigger` with `openOnHover`, `delay={0}`, `closeDelay={0}`
- A `Popover.Portal` (portal container, even when closed)
- A `Popover.Positioner` + `Popover.Popup` + `Popover.Arrow`

**Scale:** A single row with all attributes active could have **25-30 popover instances**. With `overscan: 20` and ~15 visible rows, that's roughly **35 rows × 20 badges = 700 popover instances** mounted simultaneously, most of which will never be opened.

Even if portals render nothing when closed, each `Popover.Root` still:
- Creates a React context provider
- Registers event listeners for hover detection
- Maintains internal open/close state

**Impact:** Significant React tree depth, context overhead, and event listener count. This is likely the single largest contributor to sluggish interactions and re-render cost.

### 2. `'use no memo'` Disabling React Compiler on Hot Path

**Severity: High**

Six components in the render hot path use `'use no memo'`:
- `DataGridProvider` (data-grid.tsx)
- `DataGrid` (data-grid.tsx)
- `DataGridTableHeadRowCell` (data-grid-table.tsx)
- `DataGridTableBodyRow` (data-grid-table.tsx)
- `DataGridTableBodyRowCell` (data-grid-table.tsx)
- `DataGridColumnHeader` (data-grid-column-header.tsx)

These are the components that render **per row** and **per cell**. Disabling the compiler on these means:
- Every sort/filter/scroll causes full re-render of all visible rows
- `BodyRowCell` renders 17 times per visible row — ~595 cell component executions per frame with 35 visible rows
- No automatic memoization of props, callbacks, or derived values

The `'use no memo'` directives were likely added because TanStack Table's API (`.getIsPinned()`, `.getIsLastColumn()`, etc.) returns new values on every call, making the compiler's dependency tracking produce incorrect results. This is a known friction point between TanStack Table's mutable-style API and React's expectation of referential stability.

### 3. Context-Heavy Architecture

**Severity: Medium**

Every cell component calls `useDataGrid()` to read props from context:

```tsx
function DataGridTableBodyRowCell({ cell }) {
  'use no memo'
  const { props } = useDataGrid()   // Context read on every render
  // ...uses props.tableLayout, props.tableClassNames
}
```

This means:
- **Any** change to the DataGrid context (even unrelated) triggers re-renders of every mounted cell
- The context value is a new object on every DataGrid render (no memoization due to `'use no memo'`)
- Layout config and class names are static after mount but re-read on every render

### 4. Inline Style Objects Created Per Render

**Severity: Medium**

`getPinningStyles()` creates a new object per cell per render:

```tsx
function getPinningStyles<TData>(column: Column<TData>): CSSProperties {
  return {
    left: isPinned === 'left' ? `${column.getStart('left')}px` : undefined,
    right: isPinned === 'right' ? `${column.getAfter('right')}px` : undefined,
    position: isPinned ? 'sticky' : 'relative',
    width: column.getSize(),
    zIndex: isPinned ? 1 : 0,
  }
}
```

With 17 columns × 35 rows = 595 new style objects per render cycle. While individually cheap, this compounds with the lack of memoization.

### 5. `flexRender` on Every Cell

**Severity: Medium**

TanStack Table's `flexRender()` is called per cell:

```tsx
{flexRender(cell.column.columnDef.cell, cell.getContext())}
```

`cell.getContext()` creates a new object every call. `flexRender` must determine if the cell definition is a function or component and invoke it. With 595 cells visible, this is a non-trivial overhead — especially since many cells (prices, counts) return simple text that never changes between renders.

### 6. `cn()` / `twMerge()` Called Per Cell Per Render

**Severity: Medium**

Every cell execution runs `cn()` (which calls `clsx` then `tailwind-merge`) with 5-10 conditional class strings:

```tsx
className={cn(
  'align-middle',
  bodyCellSpacing,
  props.tableLayout?.cellBorder && 'border-e',
  props.tableLayout?.columnsResizable && column.getCanResize() && 'truncate',
  cell.column.columnDef.meta?.cellClassName,
  props.tableLayout?.columnsPinnable && column.getCanPin() && '...long string...',
  column.getIndex() === 0 || ... ? props.tableClassNames?.edgeCell : '',
)}
```

`tailwind-merge` is not free — it parses and deduplicates Tailwind classes. At 595 cells per render, this adds up. The pinnable column class string is particularly long with multiple `[&[data-pinned=...]]` selectors that must be parsed every time.

### 7. Background/Border Flickering on Pinned Columns

**Severity: Medium — User-visible**

Pinned columns use:
```
data-pinned:bg-background/90 data-pinned:backdrop-blur-xs
data-pinned:group-hover:bg-muted/40 data-pinned:group-hover:backdrop-blur-md
```

The interaction between `bg-background/90` (semi-transparent), `backdrop-blur`, and row `hover:bg-muted/40` creates visual artifacts:
- During scroll, backdrop-blur recalculates per frame
- The semi-transparent background lets content behind pinned columns bleed through
- On hover, the background changes from `bg-background/90` to `bg-muted/40` — a jarring transition since these are different colors at different opacities
- `backdrop-blur-xs` upgrading to `backdrop-blur-md` on hover causes a visible blur shift

### 8. Radix ScrollArea + Virtualizer Interaction

**Severity: Medium**

The scroll area component is complex:
- Touch detection (`useTouchPrimary`) to choose between native scroll and Radix ScrollArea
- `ResizeObserver` + `scroll` event listener + `resize` event listener for mask visibility
- `checkScrollability()` runs on every scroll event, calling `setShowMask()` with state comparison
- The mask renders two absolutely-positioned overlay divs with CSS gradients

The virtualizer's scroll handler and the ScrollArea's scroll handler both fire on the same scroll events. The mask `setShowMask` calls during rapid scrolling add unnecessary state updates.

### 9. EntityAvatar Uses `next/image` with `fill` Per Cell

**Severity: Low-Medium**

Each `EntityBadge` renders an `EntityAvatar` which uses:
```tsx
<Image src={avatarPath} alt="" fill sizes="40px" className="object-contain" />
```

With `fill` mode, Next.js Image:
- Creates a wrapper with `position: relative`
- Sets up lazy loading intersection observers
- Manages srcSet generation

Two EntityBadge columns (model + provider) × 35 rows = 70 `next/image` instances. While most will be loaded, the intersection observer and sizing logic still runs per instance.

### 10. Column Resize Handler Registration

**Severity: Low**

`header.getResizeHandler()` is called in the render path without memoization:
```tsx
onMouseDown: header.getResizeHandler(),
onTouchStart: header.getResizeHandler(),
```

TanStack Table creates a new handler function each call. With `columnResizeMode: 'onChange'`, resizing triggers table-wide re-renders on every mouse move.

### 11. CVA Compound Variant Resolution at Scale

**Severity: Low**

`radBadgeVariants` in `rad-badge.tsx` defines 84 compound variants (21 colors × 4 styles). CVA must iterate through all compound variants to find matching ones. Each `RadIconBadge` renders through this. With hundreds of badges visible, variant resolution becomes measurable.

### 12. Attribute Resolution Runs Per Badge Per Render

**Severity: Low**

`AttributeBadgeSet` calls `definition.resolve(endpoint)` for every attribute on every render. These resolve functions access nested properties (`endpoint.model?.input_modalities?.includes(...)`) and some create arrays/objects. None of this is cached — the same endpoint's attributes are re-resolved on every scroll-triggered render.

---

## Positive Aspects (What's Working Well)

### SVG Sprite System
The sprite icon approach (`SpriteIcon` + `<use href>`) is well-optimized. A single 8.3KB sprite file serves all 39 icons. The `<use>` element reference means minimal DOM per icon — far better than the lucide-react component approach that would inline full SVG path data per instance. The sprite hash enables aggressive caching.

### Virtualization
Row virtualization via `@tanstack/react-virtual` is correctly implemented. Only visible rows + overscan buffer are rendered, making the 5000+ endpoint dataset manageable. The `getItemKey` callback is properly memoized.

### URL-Driven Filter State
Using `nuqs` for filter/sort state in the URL is architecturally sound — enables sharing, browser back/forward, and decouples filter state from component lifecycle.

### Pre-filtering Before TanStack
The `useMemo` in `api.ts` that filters endpoints before passing to TanStack Table is correct — it means TanStack's `getFilteredRowModel()` only handles fuzzy search on already-filtered data, not full attribute resolution.

### Data Fetching
React Query + Convex integration provides automatic background updates and caching. The data layer is clean and efficient.

---

## Summary: Root Causes of Performance Issues

Ranked by estimated impact:

1. **Popover storm** — Hundreds of `Popover.Root` instances mounted simultaneously for badges that are rarely hovered
2. **No memoization on hot path** — `'use no memo'` on every cell/row component, combined with TanStack Table's mutable API, means everything re-renders on every interaction
3. **Context architecture** — Single context for all grid config means any update cascades to every cell
4. **Per-render computation** — Style objects, `cn()` calls, `flexRender`, and attribute resolution all execute per cell per render with no caching
5. **Backdrop-blur on pinned columns** — GPU-intensive effect that causes visual flickering during scroll and hover state transitions
