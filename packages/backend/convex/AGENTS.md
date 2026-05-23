# ORCA Backend

## Concepts

- MEPs = Models, Endpoints, Providers
- Top level files export the stable public interface.
- `public_api` is completely self-contained, and never impacted by changes to backend code.
- Catalog entities use full table scans deliberately - `views` tables have a controlled, low number of rows, and this enables **perfect caching** by Convex, meaning the database is actually rarely hit during higher traffic periods.
- `defineQuerySpec` creates reusable functions that can be called directly via `.handler` and dropped into Convex functions like `query`.

## Core Principles

### 1. Derived State is Disposable

ORCA stores snapshots as the source of truth and treats processed views as rebuildable outputs.

- Projections can be dropped and regenerated.
- Processing should be idempotent.
- Recovery should prefer regeneration over complex repair.

### 2. External Data Will Change

OpenRouter and the model ecosystem will keep shifting.

- APIs and schemas will change without notice.
- Models and endpoints may appear, disappear, or return.
- We optimize for adaptability, not rigid stability.

### 3. Time Matters

All backend state is tied to snapshots.

- Missing data can mean an entity became unavailable.
- Entities may disappear temporarily, not just permanently.
- Historical state should be reconstructable from snapshot data.

### 4. Degrade Gracefully

Individual failures should not take down the pipeline.

- Partial progress is acceptable.
- Bad records should be isolated where possible.
- Failures should be visible in logs and outputs.

### 5. Think in Projections

User-facing data is a projection of stored snapshot data.

- Different views can exist for different consumers.
- Projection code should stay separate from source preservation.

# Convex

- The only requirement for valid Convex code is for it to type check successfully.
- Files in the Convex folder cannot use hyphens. A pascalCase convention is normally used, even if the rest of the project is kebab-case.
- Convex has first class support for objects as fields on documents, including indexes on nested fields.
- All documents have an immutable `_id` and `_creationTime` field.

## HTTP Endpoints and Deployment URLs

**Two separate servers run in this project:**

1. **Next.js dev server** (`localhost`) - Frontend application
   - Runs via `bun dev` or similar
   - Serves the React app from `app/` directory
   - Handles frontend routes like `/`, `/monitor`

2. **Convex backend** (`https://<deployment-name>.convex.site`) - Serverless backend
   - Runs independently in Convex cloud
   - Handles all database queries, mutations, actions
   - Serves HTTP endpoints defined in `convex/http.ts`

**Convex URL format:**

- Main: `https://<deployment-name>.convex.cloud`
- HTTP endpoints: `https://<deployment-name>.convex.site`

## Utilities

```typescript
import { asyncMap, omit, pick, pruneNull } from 'convex-helpers'
import { literals, nullable, partial, withSystemFields } from 'convex-helpers/validators'
import { paginationOptsValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { api, components, internal } from './_generated/api'
import type { Doc, Id, TableNames } from './_generated/dataModel'
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server'
```

## Common Issues

Working around the TypeScript error: some action implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
When the return value of an action depends on the result of calling ctx.runQuery or ctx.runMutation, TypeScript will complain that it cannot infer the return type of the action. This is a minimal example of the issue:

```typescript
// convex/myFunctions.ts
// TypeScript reports an error on `myAction`
export const myAction = action({
  args: {},
  handler: async (ctx) => {
    return await ctx.runQuery(api.myFunctions.getSomething)
  },
})

export const getSomething = query({
  args: {},
  handler: () => {
    return null
  },
})
```

To work around this, there are three options:

Type the return value of the handler function explicitly. Note that the handler return type is not affected by a return validator - they will not prevent this issue:

```typescript
// convex/myFunctions.ts
export const myAction = action({
  args: {},
  handler: async (ctx): Promise<null> => {
    const result = await ctx.runQuery(api.myFunctions.getSomething)
    return result
  },
})
```

Type the result of the ctx.runQuery or ctx.runMutation call explicitly:

```typescript
// convex/myFunctions.ts
export const myAction = action({
  args: {},
  handler: async (ctx) => {
    const result: null = await ctx.runQuery(api.myFunctions.getSomething)
    return result
  },
})
```

TypeScript will check that the type annotation matches what the called query or mutation returns, so you don't lose any type safety.

In this trivial example the return type of the query was null. Another option is to not return anything from an action if it isn't required:

```typescript
// convex/myFunctions.ts
export const myAction = action({
  args: {},
  handler: async (ctx) => {
    const result = await ctx.runQuery(api.myFunctions.getSomething)
    console.log({ result })
  },
})
```
