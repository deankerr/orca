import * as R from 'remeda'
import { z } from 'zod'

import { ExtractedStats } from './schema'

const Sample = ExtractedStats.shape.sample.transform(R.omit(['endpoint_id'])).nullish()

const SuppliedStats = z.object({
  stats: Sample,
  statsByTier: z.record(z.string(), Sample).nullish(),
})

/** Stats are found on source endpoints but form their own observations. */
export function extractStats(endpoint_id: string, source: unknown): ExtractedStats[] {
  const { stats, statsByTier } = SuppliedStats.parse(source)
  const samples = { ...statsByTier, default: statsByTier?.default ?? stats }

  return Object.entries(samples).flatMap(([tier, sample]) =>
    sample === null || sample === undefined ? [] : [{ endpoint_id, sample, tier }],
  )
}
