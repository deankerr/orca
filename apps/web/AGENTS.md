# apps/web

- A single dark theme, taking design inspiration from shadcn/ui and Vercel. Dense, data-heavy UIs.
- Desktop-first design.
- nuqs requires the client component to be wrapped in a `Suspense` boundary.
- Customise `shadcn` components via `className`, avoid direct modification.
- Import backend values through `@/lib/backend`, `api` from `@orca/backend/api`, and types directly; lint enforces this.

## React Compiler

- Handles useMemo and useCallback for us, keeping our code clutter-free.
- Disabled for Tanstack Table and Virtual, but child components are still correctly memoized.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
