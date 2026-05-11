# packages/backend

- `shared/` runtime code used by both the convex backend and web app.
- `convex/init.ts` default export function is executed by Convex for preview environments immediately after deployment.

### Validation - zod v4

- Always validate unknown data with `zod` before use.
- New: `z.codec`, `z.looseObject`, `z.strictObject`, `z.prettifyError`
- Changes: specific validators like `z.string().url` have been moved to the top level, e.g. `z.url`

### Observability

We use the Convex to Axiom log drain connector, which is configured in the Convex dashboard and not visible in project code.

- Runtime metrics with function names are captured for every execution, including on any `console.{log|warn|error}` or uncaught exception.
- Use `ConvexError` to throw errors with relevant domain data and a concise `message`.
- Minimize error boundaries - exception data is captured with full detail, and will roll back mutations if uncaught.

### Workflows & R2

- A process in `workflows` has been added for `analytics` and `topApps` data collection (currently unused), to store in an R2 bucket
- Once the processes have been proved in production, they will be removed from standard archive bundle

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.

<!-- convex-ai-end -->
