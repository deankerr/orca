# packages/backend

- `convex/public_api/` maintains a frozen external contract. Follow its local instructions; compatibility semantics must not shape other products.
- Allow uncaught exceptions to halt workflows and roll back mutations. Use `ConvexError` with domain data and a concise message for our own exceptions; do not catch and rethrow.
- Convex executes `convex/init.ts` after preview deployment to initialize its data.
- Preserve observed meaning, not byte fidelity or incidental object-key/array ordering.

## Data boundaries

- Parse external inputs where they enter the backend, then use the parsed result. Trust typed internal values and stored records without repeating those checks.
- Keep upstream validators with the code that parses upstream data. If a product needs a stronger guarantee about a field, check that requirement in the product.
- Ingestion stores observed facts. Products read those records and apply their own interpretation, filtering, and presentation rules.

## Code organization

- Keep each product's queries, rendering, delivery, storage, and helpers together. Put code shared by multiple products in the domain it belongs to.
- Write domain logic as ordinary pure functions. Convex functions handle database access and scheduling, then call that logic.
- Pure modules shared by backend and web code can live at the `convex/` root. Compose functions directly; avoid generic pipelines and product registries.
- Consume Objects and Scan through their named package imports, using namespaces for operations and named imports for types and validators. Relative imports stay within each module; schema assembly imports tables directly. Cross-package consumers use explicit package exports.

## Observability

- PostHog is the primary observability destination. Production streams Convex logs and reports exceptions to PostHog; Axiom remains connected as a secondary log destination.
- Console logs and uncaught exceptions are captured with Convex function details. Per-function execution statistics and deployment metrics are recorded automatically.
- Investigate using PostHog and Convex's existing logs and metrics before adding instrumentation. Do not introduce custom observability tables, wrappers, or error logging that duplicates this coverage.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
