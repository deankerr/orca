import { z } from 'zod'

import { ScannedEndpointStats } from './model'

const Sample = ScannedEndpointStats.shape.sample
  .transform(({ endpoint_id: _endpointId, ...sample }) => sample)
  .nullish()

const SuppliedStats = z.object({
  stats: Sample,
  statsByTier: z.record(z.string(), Sample).nullish(),
})

/** Stats are found on source endpoints but form their own observations. */
export function extractStats(endpoint_id: string, source: unknown): ScannedEndpointStats[] {
  const { stats, statsByTier } = SuppliedStats.parse(source)
  const samples = { ...statsByTier, default: statsByTier?.default ?? stats }

  return Object.entries(samples).flatMap(([tier, sample]) =>
    sample === null || sample === undefined ? [] : [{ endpoint_id, tier, sample }],
  )
}
