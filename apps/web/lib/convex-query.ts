import { convexQuery } from '@convex-dev/react-query'
import { queryOptions } from '@tanstack/react-query'
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server'

/**
 * Options for a live Convex query. `convexQuery` types them for Suspense with an optional
 * `queryFn` it never sets; our query clients supply the Convex `queryFn` for every query.
 * Live queries are updated by subscription, so cached results never go stale.
 */
export function convexQueryOptions<Query extends FunctionReference<'query'>>(
  query: Query,
  args: FunctionArgs<Query>,
) {
  const { queryKey } = convexQuery<Query>(query, args)

  return queryOptions<FunctionReturnType<Query>, Error, FunctionReturnType<Query>, typeof queryKey>(
    {
      queryKey,
      staleTime: Infinity,
    },
  )
}
