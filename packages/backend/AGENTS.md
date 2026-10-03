# packages/backend

- Follow [provider identity](../../docs/orca/provider-identity.md); endpoint labels are endpoint-local.
- `convex/public_api/` maintains a frozen external contract. Follow its local instructions; compatibility semantics must not shape other products.
- Shared pure modules may live at the `convex/` root and be imported by backend and web code.
- Keep normalization input validators private. Consumers validate the additional facts they need.
- Preserve observed meaning, not byte fidelity or incidental object-key/array ordering.
- Separate ingestion from products at the stored record format. Input retains facts; output interprets them.
- Group output code by product, including queries, rendering, delivery, and product-owned storage.
- Keep reused implementation within its domain; single-product helpers stay with that product.
- Compose ordinary functions rather than introducing a generic pipeline or product registry.
- Prefer pure domain functions without a Convex `ctx`, composed by thin Convex functions.
- Allow uncaught exceptions to halt workflows and roll back mutations. Use `ConvexError` with domain data and a concise message for our own exceptions; do not catch and rethrow.

## Environment and operations

- Convex executes `convex/init.ts` after preview deployment to initialize its data.
- Backend environment variables are declared in `convex/convex.config.ts`; project defaults configure new dev and preview deployments.
- Follow [development data](../../docs/orca/development-data.md) when a task needs a populated dev deployment.
- [Objects](convex/objects/README.md) records source-deployment constraints; [Discord](../../docs/orca/discord.md) covers live controls and manual delivery.

## Observability

- Axiom Log Stream is enabled on the production deployment.
- Console logs and uncaught exceptions are captured with Convex function details. Per-function execution statistics and deployment metrics are recorded automatically.
- Investigate using Axiom and Convex's existing logs and metrics before adding instrumentation. Do not introduce custom observability tables, wrappers, or error logging that duplicates this coverage.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
