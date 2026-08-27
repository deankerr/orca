import { describe, expect, test } from 'bun:test'

import { analyzeBundles } from './analysis.ts'
import { bundle, endpoint, sources } from './test-fixtures.ts'

describe('analyzeBundles', () => {
  test('orders bundles and composes adjacent transitions', async () => {
    const before = bundle('before', '2026-08-24T00:00:00.000Z', [endpoint()])
    const after = bundle('after', '2026-08-24T01:00:00.000Z', [endpoint()])

    const analysis = await analyzeBundles(sources(after, before))

    expect(analysis.bundles.map(({ crawl_id }) => crawl_id)).toEqual(['before', 'after'])
    expect(analysis.bundles[0]?.verified_endpoint_count).toBe(1)
    expect(analysis.transitions).toEqual([
      {
        endpoint_changes: [],
        from_crawl_id: 'before',
        to_crawl_id: 'after',
      },
    ])
  })

  test('rejects ambiguous crawl identities', () => {
    const first = bundle('same', '2026-08-24T00:00:00.000Z', [endpoint()])
    const second = bundle('same', '2026-08-24T01:00:00.000Z', [endpoint()])

    expect(analyzeBundles(sources(first, second))).rejects.toThrow('Duplicate crawl_id same')
  })
})
