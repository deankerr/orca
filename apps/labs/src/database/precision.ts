import * as Stream from 'effect/Stream'

export type HistoricalPrecision = 'daily' | 'full'

interface CrawlIdentity {
  readonly crawlId: string
}

interface DailyState<A> {
  readonly crawl: A
  readonly day: string
}

const utcDay = (crawl: CrawlIdentity) => new Date(Number(crawl.crawlId)).toISOString().slice(0, 10)

/**
 * Selects the final accepted crawl in each UTC day with one-crawl buffering. The raw archive
 * remains full precision; this is a disposable projection policy that lets ordinary diffing emit
 * the net daily history.
 */
const selectDaily = <A extends CrawlIdentity, E, R>(crawls: Stream.Stream<A, E, R>) =>
  crawls.pipe(
    Stream.mapAccum(
      (): DailyState<A> | undefined => undefined,
      (state, crawl) => {
        const next = { crawl, day: utcDay(crawl) }
        if (state === undefined || state.day === next.day) {
          return [next, []]
        }
        return [next, [state.crawl]]
      },
      { onHalt: (state) => (state === undefined ? [] : [state.crawl]) },
    ),
  )

export const selectHistoricalCrawls = <A extends CrawlIdentity, E, R>(
  crawls: Stream.Stream<A, E, R>,
  precision: HistoricalPrecision,
) => (precision === 'full' ? crawls : selectDaily(crawls))
