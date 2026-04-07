# Convex Pagination Backend Cheat Sheet

## Writing Paginated Queries

### Basic Structure with Index

```typescript
import { paginationOptsValidator, query } from 'convex/server'

export const list = query({
  args: {
    paginationOpts: paginationOptsValidator,
    // Add other args as needed
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('messages')
      .withIndex('by_status', (q) => (args.status ? q.eq('status', args.status) : q))
      // Avoid filters when you can use indexes instead
      // .filter((q) => args.status ? q.eq(q.field("status"), args.status) : q)
      .order('desc')
      .paginate(args.paginationOpts)
  },
})
```

### Transforming Results

```typescript
export const listWithTransformation = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const results = await ctx.db.query('messages').order('desc').paginate(args.paginationOpts)

    return {
      ...results,
      page: results.page.map((message) => ({
        ...message,
        text: message.body.slice(0, 100),
      })),
    }
  },
})
```

### Complex Query with Multiple Index Conditions

```typescript
export const listByChannelAndStatus = query({
  args: {
    paginationOpts: paginationOptsValidator,
    channelId: v.id('channels'),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('messages')
      .withIndex('by_channel_status', (q) =>
        q.eq('channelId', args.channelId).eq('status', args.status),
      )
      .order('desc')
      .paginate(args.paginationOpts)
  },
})
```

## Types and Validators

### PaginationOptions

```typescript
{
  numItems: number,    // Items to load (may vary due to reactivity)
  cursor: string | null // Start position, null for beginning
}
```

### PaginationResult

```typescript
{
  page: T[],           // Array of results
  isDone: boolean,     // Reached end?
  continueCursor: string, // Cursor for next page
  splitCursor?: string | null, // For splitting large pages
  pageStatus?: "SplitRecommended" | "SplitRequired" | null
}
```

### Return Type Validator

Define the paginated return validator inline with native Convex validators:

```typescript
import { v } from 'convex/values'

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(v.any()),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(v.literal('SplitRecommended'), v.literal('SplitRequired'), v.null()),
    ),
  }),
  handler: async (ctx, args) => {
    // Your query logic
  },
})
```

If you want stronger typing, replace `v.any()` with the item validator for that specific query.

## Manual Pagination (Actions/Mutations)

```typescript
export const exportAllData = internalAction({
  args: {},
  handler: async (ctx) => {
    let continueCursor = null
    let isDone = false
    const results = []

    while (!isDone) {
      const response = await ctx.runQuery(api.messages.list, {
        paginationOpts: { numItems: 100, cursor: continueCursor },
      })

      results.push(...response.page)
      continueCursor = response.continueCursor
      isDone = response.isDone
    }

    // Process all results
    return results.length
  },
})
```

## Performance Considerations

### Index Strategy

- **Always use indexes** for filtered pagination queries
- **Composite indexes** for multiple filter conditions
- **Avoid filters** in pagination when possible - they scan all results

### Page Size Management

```typescript
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query('messages')
      .withIndex('by_created', (q) => q)
      .order('desc')
      .paginate(args.paginationOpts)

    // Handle page splitting for large datasets
    if (results.pageStatus === 'SplitRequired') {
      console.warn('Page too large, consider reducing numItems')
    }

    return results
  },
})
```

### Batch Processing Pattern

```typescript
async function processArchivePage(ctx: ActionCtx, archives: Doc<'archives'>[]) {
  for (const archive of archives) {
    // Process each archive
    const results = await ctx.runQuery(api.items.list, {
      paginationOpts: { numItems: 50, cursor: null },
    })

    // Handle results...
  }
}
```

## Common Gotchas

### ❌ Wrong: Manual Validation

```typescript
// Don't do this - use the built-in validator
export const wrong = query({
  args: {
    paginationOpts: v.object({
      numItems: v.number(),
      cursor: v.union(v.string(), v.null()),
    }),
  },
  // ...
})
```

### ✅ Correct: Index-based Filtering

```typescript
export const correct = query({
  args: {
    paginationOpts: paginationOptsValidator,
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('messages')
      .withIndex('by_user_created', (q) => q.eq('userId', args.userId))
      .order('desc')
      .paginate(args.paginationOpts)
  },
})
```
