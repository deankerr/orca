import { describe, expect, test } from 'bun:test'

import * as Effect from 'effect/Effect'
import * as Stream from 'effect/Stream'

import type { CorpusCrawl } from '../src/corpus/types.ts'
import { selectHistoricalCrawls } from '../src/database/precision.ts'

const crawl = (crawlId: string): CorpusCrawl => ({ crawlId, endpoints: [], models: [] })

describe('historical precision', () => {
  test('selects the final accepted crawl of every UTC day', async () => {
    const crawls = [
      crawl(String(Date.UTC(2025, 0, 1, 1))),
      crawl(String(Date.UTC(2025, 0, 1, 23))),
      crawl(String(Date.UTC(2025, 0, 2, 12))),
      crawl(String(Date.UTC(2025, 0, 3, 4))),
      crawl(String(Date.UTC(2025, 0, 3, 22))),
    ]
    const selected = await Effect.runPromise(
      selectHistoricalCrawls(Stream.fromIterable(crawls), 'daily').pipe(Stream.runCollect),
    )
    expect(selected.map((item) => item.crawlId)).toEqual([
      String(Date.UTC(2025, 0, 1, 23)),
      String(Date.UTC(2025, 0, 2, 12)),
      String(Date.UTC(2025, 0, 3, 22)),
    ])
  })

  test('passes every accepted crawl through at full precision', async () => {
    const crawls = [crawl('1'), crawl('2'), crawl('3')]
    const selected = await Effect.runPromise(
      selectHistoricalCrawls(Stream.fromIterable(crawls), 'full').pipe(Stream.runCollect),
    )
    expect(selected).toEqual(crawls)
  })
})
