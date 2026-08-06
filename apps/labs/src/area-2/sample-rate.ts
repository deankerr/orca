import type { ProductPolicies } from './product-db/index.ts'

const utcDay = (crawlId: string) => new Date(Number(crawlId)).toISOString().slice(0, 10)

/**
 * Whether a chronological crawl can affect the projection after the last selected crawl. Daily
 * sampling requires only the first usable crawl in a UTC day; all later crawls in that day can be
 * skipped without reading their bundle files.
 */
export const isCrawlRequired = (
  crawlId: string,
  latestSelectedCrawlId: string | undefined,
  sampleRate: ProductPolicies['sampleRate'],
): boolean => {
  if (sampleRate === 'all' || latestSelectedCrawlId === undefined) {
    return true
  }
  return utcDay(crawlId) !== utcDay(latestSelectedCrawlId)
}
