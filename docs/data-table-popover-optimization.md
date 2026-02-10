# Data Table: Popover/Tooltip Optimization

The highest-impact single optimization for the data grid: replacing ~700 mounted `Popover.Root` instances with a single shared instance.

## Current Problem

Every `AttributeBadge` in `components/shared/attribute-badge.tsx` mounts a full Base UI `Popover.Root` with:
- `Popover.Root` (context provider + state machine)
- `Popover.Trigger` with `openOnHover`, `delay={0}`, `closeDelay={0}` (event listeners)
- `Popover.Portal` (portal container)
- `Popover.Positioner` + `Popover.Popup` + `Popover.Arrow`

With ~35 visible rows × ~20 badges per row = **~700 mounted popover instances**, each with its own state, event listeners, and portal infrastructure. The vast majority will never be opened.

## Recommended Solution: Base UI Detached Triggers (`Popover.createHandle`)

Base UI (already a project dependency: `@base-ui-components/react ^1.0.0-rc.0`) provides a **detached trigger** pattern via `Popover.createHandle<T>()`. This is purpose-built for the "N triggers, 1 popover" scenario.

### How It Works

1. Create a typed handle at module scope
2. Mount a single `Popover.Root` with that handle (the "singleton")
3. Each badge renders only a lightweight `Popover.Trigger` with a `handle` + `payload` prop -- no Root, no Portal

### Implementation Sketch

```tsx
// attribute-badge.tsx

import { Popover } from '@base-ui-components/react/popover'

// Typed payload for the singleton popover
interface AttributePopoverPayload {
  label: string
  description: React.ReactNode
  badge?: string
  details?: { label?: string; value: string }[]
}

// Singleton handle -- one per data grid
const attributePopoverHandle = Popover.createHandle<AttributePopoverPayload>()

// Provider: wraps the data grid, renders the single popover
export function AttributePopoverProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Popover.Root handle={attributePopoverHandle}>
        {({ payload }) => (
          <Popover.Portal>
            <Popover.Positioner side="top" sideOffset={8}>
              <Popover.Popup className="max-w-72 origin-[var(--transform-origin)] rounded-lg bg-[canvas] px-4 py-3 text-foreground shadow-lg outline outline-border dark:-outline-offset-1">
                <Popover.Arrow>
                  <ArrowSvg />
                </Popover.Arrow>
                <div className="mb-1 flex items-center justify-between gap-4">
                  <Popover.Title className="text-sm font-medium">
                    {payload?.label}
                  </Popover.Title>
                  {payload?.badge && (
                    <span className="font-mono text-[95%]">{payload.badge}</span>
                  )}
                </div>
                <Popover.Description className="font-sans text-sm text-muted-foreground">
                  {payload?.description}
                </Popover.Description>
                {payload?.details && payload.details.length > 0 && (
                  <DataList className="mt-2 space-y-0.5">
                    {payload.details.map((item, i) => (
                      <DataListItem key={i}>
                        {item.label && (
                          <DataListLabel className="uppercase">{item.label}</DataListLabel>
                        )}
                        <DataListValue>{item.value}</DataListValue>
                      </DataListItem>
                    ))}
                  </DataList>
                )}
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        )}
      </Popover.Root>
    </>
  )
}

// Each badge: lightweight trigger only -- no Root, no Portal
export function AttributeBadge({ definition, state }: AttributeBadgeProps) {
  const { icon, label, description, color, key } = definition
  const badge = state?.value
  const details = state?.details

  return (
    <Popover.Trigger
      handle={attributePopoverHandle}
      openOnHover
      delay={0}
      closeDelay={0}
      nativeButton={false}
      payload={{ label, description, badge, details }}
      render={<RadIconBadge variant="surface" color={color} aria-label={key} />}
    >
      <SpriteIcon name={icon} className="size-full" />
    </Popover.Trigger>
  )
}
```

### Integration Point

Wrap the data grid with the provider:

```tsx
// endpoints-data-grid/page.tsx
export function EndpointsDataGrid() {
  return (
    <AttributePopoverProvider>
      <DataGrid table={table} ...>
        {/* existing grid content */}
      </DataGrid>
    </AttributePopoverProvider>
  )
}
```

### Impact

| Metric | Before | After |
|---|---|---|
| Popover.Root instances | ~700 | 1 |
| Popover.Portal instances | ~700 | 1 |
| Popover event listeners | ~1400 (mouseenter + mouseleave per badge) | ~700 (trigger-only, delegated to singleton) |
| React context providers | ~700 (one per Root) | 1 |
| Portal containers in DOM | ~700 (even when closed) | 1 |

### Benefits

- **Already a project dependency** -- no new packages
- **Typed payloads** via `Popover.createHandle<T>()` -- type-safe data passing
- **Rich JSX content** preserved -- the `description` field (which contains `<InlineCode>` JSX) renders in the singleton's render function
- **Built-in accessibility** -- ARIA, focus management, keyboard handling
- **Animated transitions** -- CSS transitions on the Positioner for smooth movement between badges; `Popover.Viewport` supports direction-aware animations
- **Minimal refactor** -- `AttributeBadge` changes from wrapping its own Root to just rendering a Trigger

## Alternatives Considered

| Approach | Eliminates 700 instances? | Rich JSX content? | New deps? | Effort |
|---|---|---|---|---|
| **Base UI `createHandle`** | Yes (1 Root) | Yes | No | Low |
| Floating UI DIY singleton | Yes (1 floating) | Yes | No (already bundled) | High |
| Tippy.js `useSingleton` | Yes (1 tippy) | Yes | New dep | Low |
| Event delegation (imperative) | Yes (0 components) | Partial (no JSX) | No | Medium |
| CSS-only tooltips (`::after`) | Yes (0 JS) | No (plain text only) | No | Low |
| HTML `title` attribute | Yes (0 JS) | No | No | Trivial |
| Radix Tooltip | No (1 per badge) | Limited | Already installed | Low |

### Why Not Floating UI DIY?

Base UI's Popover is built on `@floating-ui/react` (same author: atomiks). Using Floating UI directly means rebuilding what Base UI already provides (accessibility, focus management, hover interactions). Since Base UI is already a dependency, `createHandle` is strictly better.

### Why Not Radix Tooltip?

Radix has no singleton pattern. Each `<Tooltip.Root>` is independent with its own state. Also has a known double-mount bug. Not designed for this use case.

### Why Not Event Delegation?

Event delegation with imperative DOM updates would work for plain text tooltips but breaks for the current use case where `Attribute.description` contains React nodes (JSX with `<InlineCode>` components). The structured `details` list also requires React rendering.

## Notes

- The `Popover.createHandle` API was introduced in `v1.0.0-beta.5` (Nov 2024) and is available in `^1.0.0-rc.0`. The API is confirmed stable in tests.
- **Package rename**: `@base-ui-components/react` was renamed to `@base-ui/react` starting with the 1.0.0 stable release (Dec 2024). The `^1.0.0-rc.0` semver range in package.json won't resolve to 1.0.0+ since those are under the new package name. Consider migrating to `@base-ui/react` (currently at 1.1.0+) for ongoing updates.
- The `Popover.Viewport` component enables direction-aware content animations when moving between triggers.
- Consider whether `delay` should be non-zero for the singleton (e.g., `delay={100}`) to prevent tooltip flashing during fast mouse movement across badge rows.
- `openOnHover`, `delay`, and `closeDelay` props live on `Popover.Trigger` (not `Popover.Root`), which maps naturally to the per-badge trigger model.
- The popover reuses DOM nodes when switching between triggers -- the popup persists rather than being destroyed and recreated.
