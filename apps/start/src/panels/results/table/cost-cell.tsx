import { defaultWorkload, isCostRaisedByNoCache, workloadCost } from '@orca/pricing'
import type { Workload } from '@orca/pricing'
import { createContext, useContext } from 'react'

import type { EndpointRow } from '#endpoints/snapshot'
import { formatCost } from '#lib/format'
import { NO_CACHE_LABEL, NoCacheMark } from '#panels/results/no-cache-mark'

/**
 * The workload the Cost cells compute under. The rows are memoised and know nothing of the workload,
 * so a context carries it past them: a change re-renders the cost cells alone, not the rows or the
 * table, and nothing else in the URL does.
 */
export const WorkloadContext = createContext<Workload>(defaultWorkload)

/**
 * An endpoint's workload cost under the current workload. A mark before the figure says the endpoint's
 * lack of a cache raises it (`isCostRaisedByNoCache`). It hangs off the figure's leading edge, so the figures stay right-aligned and their
 * digits line up down the column whether or not a row has one.
 */
export function CostCell({ row }: { row: EndpointRow }) {
  const workload = useContext(WorkloadContext)

  return (
    <span className="relative">
      {isCostRaisedByNoCache(row, workload) ? (
        <NoCacheMark
          className="absolute top-1/2 right-full mr-1.5 -translate-y-1/2 text-muted-foreground"
          label={NO_CACHE_LABEL}
        />
      ) : null}
      {formatCost(workloadCost(row, workload))}
    </span>
  )
}
