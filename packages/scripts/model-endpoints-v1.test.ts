import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  findBundlePaths,
  findLatestBundlePath,
  loadBundleSeries,
  ModelEndpointsV1Schema,
} from './model-endpoints-v1.ts'

test('finds and sequentially loads plain and gzip ModelEndpointsV1 bundles', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'orca-model-endpoints-v1-'))

  try {
    const firstPath = path.join(directory, '2026-08-24T00-30.me1.orca.json.gz')
    const secondPath = path.join(directory, '2026-08-24T12-30.me1.orca.json')
    await Bun.write(firstPath, Bun.gzipSync(new TextEncoder().encode(JSON.stringify(bundle('1')))))
    await Bun.write(secondPath, JSON.stringify(bundle('2')))

    const paths = await findBundlePaths([], directory)
    const loaded = []
    for await (const source of loadBundleSeries(paths)) {
      loaded.push(source)
    }

    expect(paths).toEqual([firstPath, secondPath])
    expect(await findLatestBundlePath(undefined, directory)).toBe(secondPath)
    expect(await findLatestBundlePath('00-30', directory)).toBe(firstPath)
    expect(await findLatestBundlePath(firstPath, directory)).toBe(firstPath)
    expect(await findBundlePaths([secondPath], directory)).toEqual([secondPath])
    expect(
      loaded.map(({ bundle: value, path: sourcePath }) => [sourcePath, value.crawl_id]),
    ).toEqual([
      [firstPath, '1'],
      [secondPath, '2'],
    ])
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('rejects data outside the shared ModelEndpointsV1 contract', () => {
  expect(() => ModelEndpointsV1Schema.parse({ data: [] })).toThrow()
})

function bundle(crawlId: string) {
  return {
    bundle_format: 'model-endpoints-v1',
    crawl_at: `2026-08-24T${crawlId === '1' ? '00' : '12'}:30:00.000Z`,
    crawl_id: crawlId,
    data: [
      {
        endpoints: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            model_variant_slug: 'example/model',
          },
        ],
        model: { permaslug: 'example/model', slug: 'example/model' },
        model_id: 'example/model',
        variant: 'standard',
      },
    ],
  }
}
