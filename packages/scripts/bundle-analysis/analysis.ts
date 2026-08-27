import type { LoadedModelEndpointsV1 } from '../model-endpoints-v1.ts'
import { analyzeBundle } from './analyze-bundle.ts'
import type { AnalyzedBundle } from './analyze-bundle.ts'
import { BundleAnalysisSchema } from './output.ts'
import type { BundleAnalysis } from './output.ts'
import { deriveTransitions } from './transitions.ts'

export async function analyzeBundles(
  sources: AsyncIterable<LoadedModelEndpointsV1>,
): Promise<BundleAnalysis> {
  const bundles: AnalyzedBundle[] = []

  // Verify every bundle before validating and comparing the complete series.
  for await (const source of sources) {
    bundles.push(analyzeBundle(source))
  }
  if (bundles.length === 0) {
    throw new Error('Bundle analysis requires at least one bundle.')
  }

  // Chronology comes from source metadata rather than filenames.
  const orderedBundles = bundles.toSorted(
    (left, right) =>
      left.crawl_at.localeCompare(right.crawl_at) ||
      left.source.path.localeCompare(right.source.path),
  )
  assertUniqueCrawls(orderedBundles)

  return BundleAnalysisSchema.parse({
    analysis_format: 'orca-bundle-analysis-v1',
    bundles: orderedBundles,
    transitions: deriveTransitions(orderedBundles),
  })
}

function assertUniqueCrawls(bundles: readonly AnalyzedBundle[]): void {
  const crawlIds = new Set<string>()
  const crawlTimes = new Set<string>()

  // Duplicate crawl identities make adjacency ambiguous.
  for (const bundle of bundles) {
    if (crawlIds.has(bundle.crawl_id)) {
      throw new Error(`Duplicate crawl_id ${bundle.crawl_id} in bundle analysis.`)
    }
    if (crawlTimes.has(bundle.crawl_at)) {
      throw new Error(`Duplicate crawl_at ${bundle.crawl_at} in bundle analysis.`)
    }
    crawlIds.add(bundle.crawl_id)
    crawlTimes.add(bundle.crawl_at)
  }
}
