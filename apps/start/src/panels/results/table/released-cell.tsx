import { createContext, useContext } from 'react'

import type { EndpointRow } from '#endpoints/snapshot'
import { formatAge, formatDate } from '#lib/format'

/**
 * The snapshot's reference time, epoch milliseconds, that the Released cells measure age from. It is
 * the scan time, so an age is stable for a given scan. The rows are memoised and do not carry it, so a
 * context does, as `WorkloadContext` carries the workload.
 */
export const ReferenceTimeContext = createContext(Number.NaN)

/** How long before the snapshot's reference time the row's model was released, with its date on hover. */
export function ReleasedCell({ row }: { row: EndpointRow }) {
  const at = useContext(ReferenceTimeContext)

  return <span title={formatDate(row.released)}>{formatAge(row.released, at)}</span>
}
