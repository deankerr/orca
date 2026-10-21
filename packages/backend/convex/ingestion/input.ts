import type { CurrentScope } from './operators/current'
import type { Source } from './operators/source'

/** Everything one request hands its processes; the queue worker decided scope and stats. */
export type IngestInput = {
  source: Source
  scope: CurrentScope
  /** Whether this request carries the current-stats snapshot. */
  current_stats: boolean
}
