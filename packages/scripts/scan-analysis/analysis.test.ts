import { expect, test } from 'bun:test'
import { deepStrictEqual, throws } from 'node:assert/strict'

import { profileJsonRecords, distinctValues, numericSummary, profileRows } from '@orca/json-profile'
import { convexToJson } from 'convex/values'

import { profileScan, viewScanReport } from '../../backend/convex/scan_analysis/profile'
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

  // Collection retains these observations even when provider attribution is unavailable.
  scan.entries = [{ ...first, endpoints }]

  const report = profileScan(scan, { scope: 'collected' })
  expect(report.endpoints.profile.record_count).toBe(6)
  expect(report.providers.profile.record_count).toBe(1)

  const info = profileRows(report.endpoints.profile).find(
    ({ value }) => value.path === '$[*]["provider_info"]',
  )

  expect(info?.missing).toBe(1)

  expect(info?.value.types).toMatchObject([
    { count: 1, type: 'null' },
    { count: 1, type: 'string' },
    { count: 3, type: 'object' },
  ])

  const model = profileScan(scan, { model: first.model_id, scope: 'collected' })
  expect(model.endpoints.profile.record_count).toBe(6)

  const provider = profileScan(scan, {
    provider: 'provider-0',
    scope: 'collected',
  })

  expect(provider.endpoints.profile.record_count).toBe(1)
  expect(provider.models.profile.record_count).toBe(1)
  expect(provider.providers.profile.record_count).toBe(1)
})

test('scan views pin capture time and select detail without changing the full report', () => {
  const report = profileScan(sampleScan(), { scope: 'orca' })
  const before = JSON.stringify(report)

  const view = viewScanReport(report, {
    paths: ['$[*]["quantization"]'],
    population: 'endpoints',
    valueLimit: null,
  })

  expect(view.scan_at).toBe(sampleScan().scan_at)
  expect(view).not.toHaveProperty('source')
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
  const orca = profileScan(scan, { scope: 'orca' })
  const collected = profileScan(scan, { scope: 'collected' })
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

  const selected = profileScan(scan, {
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
  const empty = profileScan(scan, { model: 'missing', scope: 'orca' })

  expect(
    [empty.models, empty.endpoints, empty.providers].map(({ profile }) => profile.record_count),
  ).toEqual([0, 0, 0])

  const [first] = scan.entries

  if (first === undefined) {
    throw new Error('Fixture requires a model.')
  }

  throws(() => profileScan({ ...scan, entries: [first, first] }, { scope: 'orca' }), {
    data: { message: 'Duplicate model identity', model_id: first.model_id },
    name: 'ConvexError',
  })

  const [endpoint] = first.endpoints ?? []

  if (endpoint === undefined) {
    throw new Error('Fixture requires an endpoint.')
  }

  throws(
    () =>
      profileScan(
        { ...scan, entries: [{ ...first, endpoints: [endpoint, endpoint] }] },
        { scope: 'orca' },
      ),
    {
      data: { endpoint_id: endpoint.id, message: 'Duplicate endpoint identity' },
      name: 'ConvexError',
    },
  )

  const imageEndpoint = scan.entries.find((entry) => entry.model_id === 'example/image-model')
    ?.endpoints?.[0]

  if (imageEndpoint === undefined) {
    throw new Error('Fixture requires an image endpoint.')
  }

  imageEndpoint.provider_info = null

  expect(profileScan(scan, { scope: 'orca' }).endpoints.profile.record_count).toBe(6)
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
  expect(score?.missing).toBe(1)
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

test('embeds observed values as inert JSON and escapes visible selection in the standalone report', async () => {
  const scan = sampleScan()
  const [first] = scan.entries

  if (first === undefined) {
    throw new Error('Fixture requires a model')
  }

  first.model_id = '</script><script>alert(1)</script>'
  const report = profileScan(scan, { model: first.model_id, scope: 'orca' })
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
