import { z } from 'zod'

import { AnalyzedBundleSchema } from './analyze-bundle.ts'
import { TransitionSchema } from './transitions.ts'

export const BundleAnalysisSchema = z.strictObject({
  analysis_format: z.literal('orca-bundle-analysis-v1'),
  bundles: z.array(AnalyzedBundleSchema).min(1),
  transitions: z.array(TransitionSchema),
})

export type BundleAnalysis = z.infer<typeof BundleAnalysisSchema>

export function bundleAnalysisFilename(analysis: BundleAnalysis): string {
  const first = analysis.bundles.at(0)
  const last = analysis.bundles.at(-1)
  if (first === undefined || last === undefined) {
    throw new Error('Cannot name an analysis without bundles.')
  }

  const range = first === last ? first.crawl_at : `${first.crawl_at}-${last.crawl_at}`
  return `bundle-analysis.${range}.me1.orca.json`
}
