# apps/web

- Styling: Dark theme, monospace fonts, dense layouts

## React Compiler

- useMemo and useCallback are almost never necessary to write manually.
- Keep our code clutter-free by omitting them - not adding them "just in case".
- Tanstack Table and Virtual are not yet compatible, and the compiler is selectively disabled as needed, but child components are still correctly memoized.

## Vendored Components

Do not modify vendored components without a very clear and specific reason that should apply to all uses of the component throughout the app, including future uses.

- `components/ui` shadcn/ui

### vercel.json

- Custom `buildCommand` loops through the Convex CLI to atomically deploy Convex functions on build success, and handles preview environment creation.
