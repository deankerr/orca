import { describe, expect, test } from 'bun:test'

import { selectHistoricalCrawls } from '../precision.ts'

const crawl = (crawlId: string) => ({ crawlId })

describe('Area 2 historical precision', () => {
  test('selects the final accepted crawl of every UTC day', () => {
    const crawls = [
      crawl(String(Date.UTC(2025, 0, 1, 1))),
      crawl(String(Date.UTC(2025, 0, 1, 23))),
      crawl(String(Date.UTC(2025, 0, 2, 12))),
      crawl(String(Date.UTC(2025, 0, 3, 4))),
      crawl(String(Date.UTC(2025, 0, 3, 22))),
    ]

    expect([...selectHistoricalCrawls(crawls, 'daily')].map((item) => item.crawlId)).toEqual([
      String(Date.UTC(2025, 0, 1, 23)),
      String(Date.UTC(2025, 0, 2, 12)),
      String(Date.UTC(2025, 0, 3, 22)),
    ])
  })

  test('passes every accepted crawl through at full precision', () => {
    const crawls = [crawl('1'), crawl('2'), crawl('3')]

    expect([...selectHistoricalCrawls(crawls, 'full')]).toEqual(crawls)
  })
})
