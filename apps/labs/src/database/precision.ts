import * as Stream from 'effect/Stream'

import type { CorpusCrawl } from '../corpus/types.ts'

export type HistoricalPrecision = 'daily' | 'full'

interface DailyState {
  readonly crawl: CorpusCrawl
  readonly day: string
}

const utcDay = (crawl: CorpusCrawl) => new Date(Number(crawl.crawlId)).toISOString().slice(0, 10)

/**
 * Selects the final accepted crawl in each UTC day with one-crawl buffering. The corpus remains
 * full precision; this is a disposable product-projection policy that lets ordinary diffing emit
 * the net daily history.
 */
const selectDaily = <E, R>(crawls: Stream.Stream<CorpusCrawl, E, R>) =>
  crawls.pipe(
    Stream.mapAccum(
      (): DailyState | undefined => undefined,
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

export const selectHistoricalCrawls = <E, R>(
  crawls: Stream.Stream<CorpusCrawl, E, R>,
  precision: HistoricalPrecision,
) => (precision === 'full' ? crawls : selectDaily(crawls))
