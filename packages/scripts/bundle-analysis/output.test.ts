import { expect, test } from 'bun:test'

import { analyzeBundles } from './analysis.ts'
import { bundleAnalysisFilename } from './output.ts'
import { bundle, endpoint, sources } from './test-fixtures.ts'

test('names output from the analyzed crawl range', async () => {
  const before = bundle('before', '2026-08-24T00:00:00.000Z', [endpoint()])
  const after = bundle('after', '2026-08-24T01:00:00.000Z', [endpoint()])
  const analysis = await analyzeBundles(sources(before, after))

  expect(bundleAnalysisFilename(analysis)).toBe(
    'bundle-analysis.2026-08-24T00:00:00.000Z-2026-08-24T01:00:00.000Z.me1.orca.json',
  )
})
