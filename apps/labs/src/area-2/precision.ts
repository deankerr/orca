export type HistoricalPrecision = 'daily' | 'full'

interface CrawlIdentity {
  readonly crawlId: string
}

const utcDay = (crawl: CrawlIdentity) => new Date(Number(crawl.crawlId)).toISOString().slice(0, 10)

/**
 * Selects the final accepted crawl of each UTC day. Callers must provide chronological input; the
 * raw archive remains full precision while this projection policy yields net daily changes.
 *
 * @yields {A} The selected crawl at the requested historical precision.
 */
export function* selectHistoricalCrawls<A extends CrawlIdentity>(
  crawls: Iterable<A>,
  precision: HistoricalPrecision,
): Generator<A, void, undefined> {
  if (precision === 'full') {
    yield* crawls
    return
  }

  let selected: A | undefined
  let selectedDay: string | undefined
  for (const crawl of crawls) {
    const day = utcDay(crawl)
    if (selected !== undefined && selectedDay !== day) {
      yield selected
    }
    selected = crawl
    selectedDay = day
  }
  if (selected !== undefined) {
    yield selected
  }
}
