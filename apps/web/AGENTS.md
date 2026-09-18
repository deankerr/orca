# apps/web

- Dark theme, monochromatic palette. Dense, data-heavy UIs.
- Desktop-first design.
- nuqs requires the client component to be wrapped in a `Suspense` boundary.
- Customise `shadcn` components via `className`, avoid direct modification.

## React Compiler

- Handles useMemo and useCallback for us, keeping our code clutter-free.
- Disabled for Tanstack Table and Virtual, but child components are still correctly memoized.

## Custom Component Example

```tsx
import { cn } from '@/lib/utils'

export function LabeledBox({
  label,
  className,
  children,
  ...props
}: { label?: string } & React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('space-y-2 rounded-sm border bg-card p-2 text-card-foreground', className)}
      {...props}
    >
      {label && <div className="font-mono text-sm text-muted-foreground uppercase">{label}</div>}
      {children}
    </div>
  )
}
```

```tsx
const example = () => {
  return <LabeledBox className="bg-primary">Content</LabeledBox>
}
```
