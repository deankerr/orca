import { convexQuery } from '@convex-dev/react-query'
import { api } from '@orca/backend/api'
import { queryOptions } from '@tanstack/react-query'
import type { FunctionReturnType } from 'convex/server'

type SnapshotQuery = typeof api.products.v5.catalog.snapshot

const { queryKey } = convexQuery(api.products.v5.catalog.snapshot, {})

/**
 * The whole catalogue, about 3 MB. The router's query client supplies the Convex `queryFn`, and the
 * Convex subscription keeps the result current, so it never goes stale. Identical queries are deduped.
 */
export const snapshotQuery = queryOptions<
  FunctionReturnType<SnapshotQuery>,
  Error,
  FunctionReturnType<SnapshotQuery>,
  typeof queryKey
>({ queryKey, staleTime: Infinity })
