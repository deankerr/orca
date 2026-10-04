import { expect, spyOn, test } from 'bun:test'
import { deepStrictEqual, rejects } from 'node:assert/strict'

import { profileJsonRecords, distinctValues, numericSummary, profileRows } from '@orca/json-profile'
import { ConvexHttpClient } from 'convex/browser'
import { convexToJson } from 'convex/values'

import { createObjectReader } from '../../backend/convex/objects/client'
import { ScanEntry } from '../../backend/convex/scan/collected'
import { profileScan, viewScanReport } from '../../backend/convex/scan_analysis/profile'
import { loadScan } from '../../backend/convex/scan_analysis/source'
import { sampleScan } from './fixtures'
import { renderHtml } from './html'

test('collected reports retain endpoints without usable provider bodies and preserve filter meaning', () => {
  const scan = sampleScan()
  const [first] = scan.entries
  const endpoint = first?.endpoints?.[0]

  if (first === undefined || endpoint === undefined) {
    throw new Error('Fixture requires a model and endpoint')
  }

  const { provider_info: _providerInfo, ...withoutProvider } = endpoint
  const bodies = [null, {}, { slug: 42 }, 'unknown']
  const endpoints = [
    withoutProvider,
    ...bodies.map((provider_info, index) => ({
      ...endpoint,
      id: `unattributed-${index}`,
      provider_info,
    })),
    { ...endpoint, id: 'attributed' },
  ]

  // These observations satisfy stored-scan validation, even when provider attribution is unavailable.
  scan.entries = [ScanEntry.parse({ ...first, endpoints })]

  const report = profileScan(scan, 'example-source', { scope: 'collected' })
  expect(report.endpoints.profile.record_count).toBe(6)
  expect(report.providers.profile.record_count).toBe(1)

  const info = profileRows(report.endpoints.profile).find(
    ({ value }) => value.path === '$[*]["provider_info"]',
  )
  expect(info?.none).toBe(1)
  expect(info?.value.types).toMatchObject([
    { count: 1, type: 'null' },
    { count: 1, type: 'string' },
    { count: 3, type: 'object' },
  ])

  const model = profileScan(scan, 'example-source', { model: first.model_id, scope: 'collected' })
  expect(model.endpoints.profile.record_count).toBe(6)

  const provider = profileScan(scan, 'example-source', {
    provider: 'provider-0',
    scope: 'collected',
  })
  expect(provider.endpoints.profile.record_count).toBe(1)
  expect(provider.models.profile.record_count).toBe(1)
  expect(provider.providers.profile.record_count).toBe(1)
})

test('scan views pin provenance and select detail without changing the full report', () => {
  const report = profileScan(sampleScan(), 'example-source', { scope: 'orca' })
  const before = JSON.stringify(report)
  const view = viewScanReport(report, {
    paths: ['$[*]["quantization"]'],
    population: 'endpoints',
    valueLimit: null,
  })

  expect(view.source).toEqual({ deployment: 'example-source', scan_at: sampleScan().scan_at })
  expect(view.populations).toHaveLength(1)
  expect(view.populations[0]?.record_count).toBe(6)
  expect(view.populations[0]?.fields).toHaveLength(1)
  expect(view.populations[0]?.fields[0]?.types).toMatchObject([
    { count: 2, type: 'null' },
    { count: 4, type: 'string', values: { complete: true, entries: [{ count: 4, value: 'fp8' }] } },
  ])

  // Paths are values, not object keys beginning with "$", so the view crosses Convex transport.
  deepStrictEqual(convexToJson(view), view)
  expect(JSON.stringify(report)).toBe(before)
})

test('profiles the same ORCA scope and identities, with explicit collected and filtered populations', () => {
  const scan = sampleScan()
  const orca = profileScan(scan, 'example-source', { scope: 'orca' })
  const collected = profileScan(scan, 'example-source', { scope: 'collected' })
  expect(orca.models.profile.record_count).toBe(3)
  expect(orca.endpoints.profile.record_count).toBe(6)
  expect(orca.providers.profile.record_count).toBe(2)
  expect(collected.models.profile.record_count).toBe(5)
  expect(collected.endpoints.profile.record_count).toBe(12)
  expect(collected.providers.profile.record_count).toBe(2)

  expect(
    profileRows(orca.endpoints.profile).some(({ value }) => value.path.endsWith('["status"]')),
  ).toBe(false)

  expect(
    profileRows(collected.endpoints.profile).some(({ value }) => value.path.endsWith('["status"]')),
  ).toBe(true)

  const selected = profileScan(scan, 'example-source', {
    model: 'example/text-model',
    provider: 'provider-0',
    scope: 'orca',
  })

  expect(selected.models.profile.record_count).toBe(1)
  expect(selected.endpoints.profile.record_count).toBe(2)
  expect(selected.providers.profile.record_count).toBe(1)

  expect(selected.endpoints.examples['$[*]["quantization"]']).toEqual([
    { id: '00000000-0000-4000-8000-000000000000', value: null },
    { id: '00000000-0000-4000-8000-000000000002', value: 'fp8' },
  ])

  const quantization = profileRows(selected.endpoints.profile).find(
    ({ value }) => value.path === '$[*]["quantization"]',
  )

  expect(quantization === undefined ? 0 : distinctValues(quantization.value)).toBe(2)
  const empty = profileScan(scan, 'example-source', { model: 'missing', scope: 'orca' })

  expect(
    [empty.models, empty.endpoints, empty.providers].map(({ profile }) => profile.record_count),
  ).toEqual([0, 0, 0])

  const [first] = scan.entries

  if (first === undefined) {
    throw new Error('Fixture requires a model.')
  }

  expect(() =>
    profileScan({ ...scan, entries: [first, first] }, 'example-source', { scope: 'orca' }),
  ).toThrow('Duplicate model identity')

  const imageEndpoint = scan.entries.find((entry) => entry.model_id === 'example/image-model')
    ?.endpoints?.[0]

  if (imageEndpoint === undefined) {
    throw new Error('Fixture requires an image endpoint.')
  }

  imageEndpoint.provider_info = null

  expect(
    profileScan(scan, 'example-source', { scope: 'orca' }).endpoints.profile.record_count,
  ).toBe(6)
})

test('numeric summaries weight frequencies and keep nested absence, array occurrences and strings distinct', () => {
  const profile = profileJsonRecords([
    { nested: { score: 1 }, price: '0.000001', tags: ['x', 'x'] },
    { nested: { score: 1 }, tags: [] },
    { nested: { score: 100 } },
    { nested: {} },
    {},
  ])

  const rows = profileRows(profile)
  const score = rows.find(({ value }) => value.path.endsWith('["score"]'))
  const price = rows.find(({ value }) => value.path.endsWith('["price"]'))
  expect(score?.none).toBe(1)
  expect(score?.value.population).toBe(4)

  expect(score === undefined ? null : numericSummary(score.value)).toEqual({
    count: 3,
    max: 100,
    median: 1,
    min: 1,
    p95: 100,
  })

  expect(price === undefined ? 'missing' : numericSummary(price.value)).toBeNull()
  expect(rows.find(({ value }) => value.path === '$[*]["tags"][*]')?.value.population).toBe(2)
})

test('selects and decompresses one source object, with exact-time reads bypassing discovery', async () => {
  const scan = sampleScan()

  const text = scan.entries
    .map((entry) => JSON.stringify({ ...entry, scan_at: scan.scan_at }))
    .join('\n')

  const name = `scan.${scan.scan_at}.jsonl`
  const query = spyOn(ConvexHttpClient.prototype, 'query').mockResolvedValue([name])

  const action = spyOn(ConvexHttpClient.prototype, 'action').mockResolvedValue([
    { bytes: Bun.gzipSync(text).buffer, codec: 'gzip' },
  ])

  const reader = createObjectReader('example-source', 'not-a-real-key')

  try {
    expect(await loadScan(reader)).toEqual(scan)

    expect(query.mock.calls[0]?.[1]).toEqual({
      apiKey: 'not-a-real-key',
      atOrAfter: '',
      limit: 1,
      order: 'desc',
      path: 'scans',
    })

    expect(action.mock.calls[0]?.[1]).toEqual({
      apiKey: 'not-a-real-key',
      objects: [{ name, path: 'scans' }],
    })

    expect(await loadScan(reader, scan.scan_at)).toEqual(scan)
    expect(query).toHaveBeenCalledTimes(1)
    action.mockResolvedValue([null])
    await rejects(loadScan(reader, scan.scan_at), /Scan not found/)
    action.mockResolvedValue([])
    await rejects(loadScan(reader, scan.scan_at), /invalid batch/)

    action.mockResolvedValue([
      { bytes: Bun.gzipSync(text.replaceAll(scan.scan_at, 'wrong')).buffer, codec: 'gzip' },
    ])

    await rejects(loadScan(reader, scan.scan_at), /identity does not match/)
    query.mockResolvedValue([])
    await rejects(loadScan(reader), /no stored scans/)
    await rejects(loadScan(reader, '2026-10-03'))
  } finally {
    query.mockRestore()
    action.mockRestore()
  }
})

test('embeds source values as inert JSON and escapes visible provenance in the standalone report', async () => {
  const report = profileScan(sampleScan(), '</script><script>alert(1)</script>', { scope: 'orca' })
  const html = await renderHtml(report)
  expect(html).not.toContain('</script><script>alert(1)</script>')
  expect(html).toContain('\\u003c/script>')
  expect(html).toContain('&lt;/script&gt;')
  expect(html).not.toContain('<script src=')

  const payload = /<script type="application\/json" id="report">(?<payload>.*?)<\/script>/s.exec(
    html,
  )?.groups?.payload

  expect(payload === undefined ? null : JSON.parse(payload)).toEqual(report)
})
