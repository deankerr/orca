# Data Table: CSS & Rendering Performance

Targeted CSS optimizations for the data grid, ranked by impact.

---

## 1. Replace `backdrop-blur` on Pinned Columns (High Impact)

### Problem

The current code applies multiple `backdrop-filter: blur()` layers on pinned cells:

```
data-pinned:backdrop-blur-md              (header cells)
data-pinned:backdrop-blur-xs              (body cells at rest)
data-pinned:group-hover:backdrop-blur-md  (body cells on row hover)
data-pinned:bg-background/90             (90% opacity -- content bleeds through)
data-pinned:group-hover:bg-muted/40      (hover -- different color at different opacity)
```

`backdrop-filter: blur()` recalculates a Gaussian blur of the pixels underneath the element **every frame during scroll**. Combined with semi-transparent backgrounds that let content bleed through, this causes:

- Per-frame blur recalculation during horizontal scroll
- Flickering as content scrolls under the blurred area
- Visual "pop" when blur-xs upgrades to blur-md on hover
- [Firefox-specific lag with backdrop-filter on many `<td>` elements](https://bugzilla.mozilla.org/show_bug.cgi?id=1718471)

### Solution

Replace with solid opaque backgrounds + box-shadow. This is what AG Grid and MUI Data Grid both use. Neither uses `backdrop-filter`.

**Before:**
```
data-pinned:bg-background/90 data-pinned:backdrop-blur-xs
data-pinned:group-hover:bg-muted/40 data-pinned:group-hover:backdrop-blur-md
```

**After:**
```
data-pinned:bg-background
data-pinned:group-hover:bg-muted
```

Add a shadow to the last pinned column edge for depth:
```css
[data-last-col="left"] {
  box-shadow: 4px 0 8px -2px rgba(0, 0, 0, 0.1);
}
```

`box-shadow` is paint-only (no layout trigger) and far cheaper than `backdrop-filter`.

---

## 2. Pre-compute Class Strings (Medium Impact)

### Problem

`cn()` (which calls `clsx` then `tailwind-merge`) runs per cell per render. The pinned column class string in `DataGridTableBodyRowCell` is particularly expensive to parse:

```tsx
props.tableLayout?.columnsPinnable &&
  column.getCanPin() &&
  'data-pinned:bg-background/90 data-pinned:backdrop-blur-xs data-pinned:group-hover:bg-muted/40 data-pinned:group-hover:backdrop-blur-md [&[data-pinned=left][data-last-col=left]]:border-e! [&[data-pinned=right][data-last-col=right]]:border-s! [&[data-pinned][data-last-col]]:border-border'
```

With 595 cells per render, `tailwind-merge` parses and deduplicates this long string 595 times.

### Solution

Extract static class strings to module-level constants:

```tsx
const PINNED_BODY_CELL_CLASSES =
  'data-pinned:bg-background data-pinned:group-hover:bg-muted [&[data-pinned=left][data-last-col=left]]:border-e! [&[data-pinned=right][data-last-col=right]]:border-s! [&[data-pinned][data-last-col]]:border-border'

const PINNED_HEAD_CELL_CLASSES =
  'data-pinned:bg-background [&:not([data-pinned]):has(+[data-pinned])_div.cursor-col-resize:last-child]:opacity-0 [&[data-last-col=left]_div.cursor-col-resize:last-child]:opacity-0 [&[data-pinned=left][data-last-col=left]]:border-e! [&[data-pinned=right]:last-child_div.cursor-col-resize:last-child]:opacity-0 [&[data-pinned=right][data-last-col=right]]:border-s! [&[data-pinned][data-last-col]]:border-border'
```

These never change between renders, so they should be computed once.

---

## 3. Move State-Driven Styles to CSS (Medium Impact)

### Problem

Conditional classes for pinned column borders are computed in JS and merged via `cn()`:

```tsx
'[&[data-pinned=left][data-last-col=left]]:border-e!'
'[&[data-pinned=right][data-last-col=right]]:border-s!'
'[&[data-pinned][data-last-col]]:border-border'
```

These are entirely determined by `data-pinned` and `data-last-col` attributes that ORCA already sets on cells.

### Solution

Define these in CSS (e.g., `globals.css` or a data-grid-specific stylesheet):

```css
/* Pinned column styling -- replaces JS-computed Tailwind classes */
[data-slot="data-grid-table"] td[data-pinned] {
  background: var(--color-background);
}

[data-slot="data-grid-table"] tr:hover td[data-pinned] {
  background: var(--color-muted);
}

[data-slot="data-grid-table"] td[data-pinned][data-last-col="left"] {
  border-inline-end: 1px solid var(--color-border);
  box-shadow: 4px 0 8px -2px rgba(0, 0, 0, 0.1);
}

[data-slot="data-grid-table"] td[data-pinned][data-last-col="right"] {
  border-inline-start: 1px solid var(--color-border);
}
```

This shifts work from JS class merging (595 calls to `tailwind-merge`) to the browser's CSS selector matching engine (highly optimized).

---

## 4. Use `clsx`/`twJoin` Where No Conflicts Exist (Low-Medium Impact)

### Problem

Most cell class strings are additive -- no Tailwind class conflicts to resolve. But `cn()` still runs `tailwind-merge` to check.

### Solution

Use `clsx` (already a dependency) directly for cells where the classes are purely additive:

```tsx
// Before: cn() with tailwind-merge
className={cn('align-middle', bodyCellSpacing, cellBorder && 'border-e', meta?.cellClassName)}

// After: clsx only (no merge needed -- these classes never conflict)
className={clsx('align-middle', bodyCellSpacing, cellBorder && 'border-e', meta?.cellClassName)}
```

Reserve `cn()` for cases where class conflicts actually exist (e.g., overriding a background color).

The `tailwind-merge` author explicitly advises: "I wouldn't consider it free performance-wise and only use it when I specifically want to merge Tailwind CSS classes."

---

## 5. Add `contain: content` to `<td>` Elements (Low-Medium Impact)

### What It Does

`contain: content` (equivalent to `layout paint style`) tells the browser that a cell's layout and paint are independent of the rest of the page. The browser can skip re-laying-out and re-painting other cells when one cell changes.

### Spec Validity

Per the [W3C CSS Containment Module Level 2](https://www.w3.org/TR/css-contain-2/), `contain: layout` and `contain: paint` **do** work on `<td>` (table-cell display). They do **not** work on `<tr>`, `<tbody>`, `<thead>`.

### Caveats

- `contain: paint` clips overflow. Test any cells with dropdown triggers or overflow content.
- `contain: size` on `<td>` is silently ignored (table layout algorithm conflict).
- Only beneficial if Chrome DevTools Paint Flashing shows broad repaint areas.

### Application

```css
[data-slot="data-grid-table"] td {
  contain: content;
}
```

---

## 6. Narrow `transition-colors` on Grid Rows (Low Impact)

### Problem

The `group hover:bg-muted/40` on rows uses `transition-colors`, which transitions `color`, `background-color`, `border-color`, `outline-color`, and their text-decoration equivalents. During scroll with the mouse over the grid, this triggers animated paint operations on every row the cursor passes.

### Solution

Either remove the transition entirely (instant hover feedback is common in dense data grids) or narrow it:

```tsx
// Instead of transition-colors (5+ properties)
'transition-[background-color]'
```

---

## 7. Audit with Chrome DevTools

Before implementing, profile the current state:

1. **Paint Flashing** (Rendering tab > "Paint flashing"): Green rectangles show repainted areas. If the entire grid flashes green during scroll, paint scope is too broad.
2. **Scrolling Performance Issues** (Rendering tab): Highlights scroll-related event listeners.
3. **Layer Borders** (Rendering tab): Check whether sticky cells are already GPU-composited.
4. **Performance panel**: Record a scroll. Look for purple (style recalc), green (paint), and frames exceeding 16.6ms.

Always profile in Incognito -- extensions affect performance data.

---

## Things to Avoid

| Approach | Why |
|---|---|
| `content-visibility: auto` on table rows | Breaks `position: sticky` by applying `contain: size layout paint style` |
| `will-change: transform` on every pinned cell | ~60-120 GPU layers for marginal benefit if cells are already composited by sticky |
| CSS Grid migration | Performance difference is marginal with only ~30 rows in DOM; large refactor for small gain |
| `background-attachment: fixed` | Triggers paint + composite on every scroll frame |

---

## Summary: Priority Order

| # | Change | Impact | Effort |
|---|---|---|---|
| 1 | Replace `backdrop-blur` with solid bg + box-shadow | Eliminates per-frame blur recalculation | Low |
| 2 | Pre-compute pinned class strings as constants | Eliminates ~595 string operations/render | Low |
| 3 | Move `data-pinned` styling to CSS selectors | Eliminates JS class merging for state styles | Medium |
| 4 | Use `clsx` instead of `cn()` where no conflicts | Reduces merge overhead per cell | Low |
| 5 | Add `contain: content` to `<td>` | Limits layout/paint scope | Low (test clipping) |
| 6 | Narrow/remove `transition-colors` on rows | Reduces hover-during-scroll paint | Low |
