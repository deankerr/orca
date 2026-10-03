# apps/web

- Dark theme, monochromatic palette. Dense, data-heavy UIs.
- Desktop-first design.
- nuqs requires the client component to be wrapped in a `Suspense` boundary.
- Customise `shadcn` components via `className`, avoid direct modification.

## React Compiler

- Handles useMemo and useCallback for us, keeping our code clutter-free.
- Disabled for Tanstack Table and Virtual, but child components are still correctly memoized.
