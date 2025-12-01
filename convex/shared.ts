import { paginationOptsValidator, PaginationResult } from 'convex/server'

import type { Doc, TableNames } from './_generated/dataModel'
import type { ActionCtx, MutationCtx } from './_generated/server'

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }
  return 'Abnormal Error'
}

/**
 * Utility function to paginate through a table and process each page of results.
 * This abstracts the common pattern of fetching paginated data and processing it.
 *
 * @param ctx - The Convex context (ActionCtx, MutationCtx, or QueryCtx)
 * @param args - Configuration object containing queryFnArgs, queryFn, processFn, and optional batchSize
 *
 * The processFn can return false to signal early termination of pagination.
 * Returning void, undefined, or true will continue pagination.
 */
export async function paginateAndProcess<T extends Doc<TableNames>>(
  ctx: ActionCtx | MutationCtx,
  args: {
    queryFnArgs: Record<string, any>
    queryFn: (
      ctx: ActionCtx | MutationCtx,
      args: { paginationOpts: typeof paginationOptsValidator.type } & Record<string, any>,
    ) => Promise<PaginationResult<T>>
    processFn: (items: T[]) => Promise<void | boolean>
    batchSize: number
  },
): Promise<void> {
  const { queryFnArgs, queryFn, processFn, batchSize } = args

  let cursor: string | null = null

  while (true) {
    const results = await queryFn(ctx, {
      ...queryFnArgs,
      paginationOpts: {
        numItems: batchSize,
        cursor,
      },
    })

    if (results.page.length === 0) {
      break
    }

    const shouldContinue = await processFn(results.page)

    if (shouldContinue === false) {
      break
    }

    if (results.isDone) {
      break
    }

    cursor = results.continueCursor
  }
}
