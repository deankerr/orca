# packages/backend

- `convex/public_api/` maintains a frozen external contract; follow its local instructions.
- Keep public API compatibility semantics out of other products.
- Allow uncaught exceptions to halt workflows and roll back mutations.
- Use `ConvexError` with domain data and a concise message for our own exceptions; do not catch and rethrow.
- Convex executes `convex/init.ts` after preview deployment to initialize its data.
- Preserve observed meaning, not byte fidelity or incidental object-key/array ordering.
- Run backend tests with `bun test` and import test APIs from `bun:test`.
- Bun testing takes precedence over the Vitest setup in Convex skills and generated guidance.

## Data boundaries

- Parse external inputs at the backend boundary, then use the parsed result.
- Trust typed internal values and stored records without repeating boundary checks.
- Keep upstream validators with the code that parses upstream data.
- Check stronger field guarantees in the product that requires them.
- Ingestion stores observed facts; products apply their own interpretation, filtering, and presentation.

## Code organization

- Keep each product's queries, rendering, delivery, storage, and helpers together.
- Put code shared by multiple products in the domain it belongs to.
- Write domain logic as ordinary pure functions; Convex functions handle database access and scheduling.
- Pure modules shared by backend and web code can live at the `convex/` root.
- Compose functions directly; avoid generic pipelines and product registries.

### Objects and Scan

- Consume Objects and Scan through their named package imports.
- Use namespaces for operations and named imports for types and validators.
- Keep relative imports within each module; schema assembly imports tables directly.
- Cross-package consumers use explicit package exports.

## Observability

Production streams Convex logs and exceptions to PostHog, the primary observability destination.
Axiom remains connected as a secondary log destination. Captured logs and exceptions include
Convex function details; execution statistics and deployment metrics are recorded automatically.

Investigate existing logs and metrics before adding instrumentation. Do not add custom observability
tables, wrappers, or error logging that duplicates this coverage.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
