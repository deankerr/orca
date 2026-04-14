# packages/backend

- `shared/` runtime code used by both the convex backend and web app.
- `convex/init.ts` default export function is executed by Convex for preview environments immediately after deployment.

### Logging

- The Convex backend is linked to Axiom, which captures all console.logs automatically
- We use an simple ad-hoc structured logging format, e.g. `console.log('[function] optional short message', { someData, otherData })`
- Optionally use `[function:subFunction]` only when necessary.
- A single Convex function can emit a total of 256 log messages, with any further being truncated - keep in mind during processing loops.

### Validation - zod v4

- Always validate unknown data with `zod` before use.
- New: `z.codec`, `z.looseObject`, `z.strictObject`, `z.prettifyError`
- Changes: specific validators like `z.string().url` have been moved to the top level, e.g. `z.url`

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
