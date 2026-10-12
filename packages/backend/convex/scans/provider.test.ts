import { expect, test } from 'bun:test'
import { ok } from 'node:assert/strict'

import { prepare } from '../ingestion/events'
import { providerEntity } from '../ingestion/lenses'
import type { RawScan } from './collected'
import { extractScan as extract, extractScan as fromCollected } from './extraction/extract'
import { assembleProviders, ProviderInput, providerId } from './extraction/providers'

test('provider identity uses slash prefixes and explicit historical repairs, without names', () => {
  for (const [slug, id] of [
    ['azure/eu', 'azure'],
    ['baseten/2', 'baseten'],
    ['xai/zdr/us', 'xai'],
    ['sambanova-turbo', 'sambanova'],
    ['nebius-fast', 'nebius'],
    ['nebius/fast', 'nebius'],
    ['wandb-legacy', 'wandb'],
    ['model-run', 'modelrun'],
    ['amazon-bedrock/claude-on-aws', 'claude-on-aws'],
    ['anthropic/claude-on-aws', 'claude-on-aws'],
    ['anthropic/2', 'claude-on-aws'],
    ['anthropic', 'anthropic'],
    ['amazon-bedrock', 'amazon-bedrock'],
    ['unrecognized-provider/region', 'unrecognized-provider'],
  ]) {
    expect(providerId(slug)).toBe(id)
    expect(providerId(id)).toBe(id)
    expect(
      assembleProviders([ProviderInput.parse({ slug, displayName: 'Provider' })]).get(id),
    ).toEqual({
      provider_id: id,
      displayName: 'Provider',
    })
  }
})

test('omits endpoint policy defaults while preserving other provider facts', () => {
  const input = {
    slug: 'provider',
    name: 'Provider',
    displayName: 'Provider',
    headquarters: null,
    datacenters: ['US'],
    statusPageUrl: null,
    byokEnabled: true,
    sendClientIp: false,
    futureFact: { nested: ['value'] },
    adapterName: 'Adapter',
    baseUrl: 'https://example.test',
    pricingStrategy: 'strategy',
    regionOverrides: { us: 'internal' },
    hasChatCompletions: true,
    hasCompletions: true,
    isAbortable: true,
    isMultipartSupported: true,
    isPrivate: false,
    moderationRequired: false,
    requiredAttestationTypes: [],
    editors: [],
    owners: [],
    ignoredProviderModels: ['model'],
    icon: { url: 'icon.svg', className: 'invert' },
    dataPolicy: {
      paidModels: { training: true },
      training: true,
      trainingOpenRouter: true,
      retainsPrompts: true,
      retentionDays: 30,
      canPublish: false,
      requiresUserIDs: true,
      termsOfServiceURL: 'https://example.test/terms',
      privacyPolicyURL: null,
      futurePolicy: { disclosure: true },
    },
  }
  const before = structuredClone(input)
  const provider = assembleProviders([ProviderInput.parse(input)]).get('provider')
  ok(provider)

  expect(provider).toEqual({
    ...Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== 'slug' && key !== 'dataPolicy'),
    ),
    provider_id: 'provider',
    name: 'Provider',
    displayName: 'Provider',
    headquarters: null,
    datacenters: ['US'],
    statusPageUrl: null,
    byokEnabled: true,
    sendClientIp: false,
    futureFact: { nested: ['value'] },
    dataPolicy: {
      termsOfServiceURL: 'https://example.test/terms',
      privacyPolicyURL: null,
      futurePolicy: { disclosure: true },
    },
  })
  expect(providerEntity(provider).metadata).toHaveProperty('futureFact', input.futureFact)
  expect(input).toEqual(before)
  expect(ProviderInput.parse({ slug: 'p', displayName: 'Provider' })).not.toHaveProperty(
    'dataPolicy',
  )
  expect(
    ProviderInput.parse({ slug: 'p', displayName: 'Provider', dataPolicy: null }),
  ).toMatchObject({ dataPolicy: null })
  expect(
    ProviderInput.parse({ slug: 'p', displayName: 'Provider', dataPolicy: { training: true } }),
  ).toHaveProperty('dataPolicy', {})
})

test('canonical observations outrank variants; name frequency and ties ignore input order', () => {
  const observations = [
    { slug: 'azure/eu', displayName: 'Azure EU', headquarters: 'EU' },
    { slug: 'azure/eu', displayName: 'Azure EU', headquarters: 'EU' },
    { slug: 'azure', displayName: 'Azure (BYOK Only)', headquarters: 'US' },
    { slug: 'azure', displayName: 'Azure', headquarters: 'US' },
    { slug: 'azure', displayName: 'Azure', headquarters: 'US' },
  ].map((body) => ProviderInput.parse(body))

  const expected = { provider_id: 'azure', displayName: 'Azure', headquarters: 'US' }
  expect(assembleProviders(observations).get('azure')).toEqual(expected)
  expect(assembleProviders(observations.toReversed()).get('azure')).toEqual(expected)

  const fallback = [
    ProviderInput.parse({ slug: 'azure/us', displayName: 'Azure US' }),
    ProviderInput.parse({ slug: 'azure/eu', displayName: 'Azure EU' }),
  ]
  expect(assembleProviders(fallback).get('azure')).toEqual({
    provider_id: 'azure',
    displayName: 'Azure EU',
  })
  expect(assembleProviders(fallback.toReversed())).toEqual(assembleProviders(fallback))
})

test('metadata cannot split name votes or select the representative; source changes remain observable', () => {
  const endpoints = [
    endpoint('c', 'azure', { displayName: 'Azure', statusPageUrl: 'https://c.example' }),
    endpoint('b', 'azure', { displayName: 'Azure', statusPageUrl: 'https://b.example' }),
    endpoint('a', 'azure', { displayName: 'Azure', statusPageUrl: 'https://a.example' }),
    endpoint('d', 'azure', { displayName: 'Azure (BYOK Only)' }),
    endpoint('e', 'azure', { displayName: 'Azure (BYOK Only)' }),
  ]
  const before = structuredClone(endpoints)
  const selected = fromCollected(captured(endpoints)).providers.get('azure')

  expect(selected).toEqual({
    provider_id: 'azure',
    displayName: 'Azure',
    statusPageUrl: 'https://a.example',
  })
  expect(fromCollected(captured(endpoints.toReversed())).providers.get('azure')).toEqual(selected)
  expect(endpoints).toEqual(before)

  const unselectedChanged = endpoints.map((item) =>
    item.id === 'b'
      ? endpoint('b', 'azure', {
          displayName: 'Azure',
          statusPageUrl: 'https://b.example',
          futureFact: ['z', 'a'],
        })
      : item,
  )
  expect(fromCollected(captured(unselectedChanged)).providers.get('azure')).toEqual(selected)

  const selectedChanged = endpoints.map((item) =>
    item.id === 'a'
      ? endpoint('a', 'azure', {
          displayName: 'Azure',
          statusPageUrl: 'https://changed.example',
          futureFact: ['z', 'a'],
        })
      : item,
  )
  expect(fromCollected(captured(selectedChanged)).providers.get('azure')).toEqual({
    provider_id: 'azure',
    displayName: 'Azure',
    statusPageUrl: 'https://changed.example',
    futureFact: ['z', 'a'],
  })
})

test('extraction preserves endpoint facts and raw inputs while grouping providers before events', () => {
  const base = endpoint('base', 'azure', { name: 'Azure' })
  const regional = endpoint('regional', 'azure/eu', {
    name: 'An inconsistent upstream name',
    displayName: 'Azure EU',
  })
  regional.provider_slug = 'azure/swedencentral'
  regional.data_policy = { training: true, retainsPrompts: true }
  const raw = captured([base, regional])
  const before = structuredClone(raw)
  const scan = fromCollected(raw)

  expect([...scan.providers.keys()]).toEqual(['azure'])
  expect(scan.providers.get('azure')).toEqual({
    provider_id: 'azure',
    name: 'Azure',
    displayName: 'Provider',
  })
  expect(scan.endpoints.get('regional')).toMatchObject({
    id: 'regional',
    provider_id: 'azure',
    provider_tag: 'azure/swedencentral',
    provider_display_name: 'Endpoint label',
    data_policy: { training: true, retainsPrompts: true },
  })
  expect(scan.endpoints.get('regional')).not.toHaveProperty('status')
  expect(scan.endpoints.get('regional')).not.toHaveProperty('provider_info')
  expect(raw).toEqual(before)

  const next = extract(captured([base], '2026-10-08T01:00:00.000Z'))
  const events = prepare({ previous: extract(raw), next })
  expect(
    events.map(({ entity_kind, entity_id, type }) => ({ entity_kind, entity_id, type })),
  ).toEqual([{ entity_kind: 'endpoint', entity_id: 'regional', type: 'REMOVE' }])
})

test('Nebius tag repair keeps endpoint and provider identity continuous', () => {
  const base = endpoint('base', 'nebius', { displayName: 'Nebius' })
  const previous = extract(captured([base, endpoint('fast', 'nebius-fast')]))
  const next = extract(
    captured([base, endpoint('fast', 'nebius/fast')], '2026-10-08T01:00:00.000Z'),
  )
  const events = prepare({ previous, next })

  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ entity_kind: 'endpoint', entity_id: 'fast', type: 'UPDATE' })
  expect(JSON.parse(events[0].change_json)).toMatchObject({
    changes: [
      { type: 'UPDATE', key: 'provider_tag', value: 'nebius/fast', oldValue: 'nebius-fast' },
    ],
  })
})

test('Claude on AWS repairs precede prefix grouping without merging its ordinary parent providers', () => {
  const scan = fromCollected(
    captured([
      endpoint('anthropic', 'anthropic', { displayName: 'Anthropic' }),
      endpoint('bedrock', 'amazon-bedrock', { displayName: 'Amazon Bedrock' }),
      endpoint('old-two', 'anthropic/2', { displayName: 'Anthropic 2' }),
      endpoint('old-anthropic', 'anthropic/claude-on-aws', {
        name: 'Amazon Bedrock',
        byokEnabled: true,
        dataPolicy: { privacyPolicyURL: 'https://aws.example/privacy' },
      }),
      endpoint('old-bedrock', 'amazon-bedrock/claude-on-aws', { name: 'Amazon Bedrock' }),
      endpoint('canonical', 'claude-on-aws', {
        name: 'Claude Platform on AWS',
        displayName: 'Claude Platform on AWS',
        byokEnabled: false,
        dataPolicy: { privacyPolicyURL: 'https://anthropic.example/privacy' },
      }),
    ]),
  )

  expect([...scan.providers.keys()].toSorted()).toEqual([
    'amazon-bedrock',
    'anthropic',
    'claude-on-aws',
  ])
  expect(scan.endpoints.size).toBe(6)
  expect(scan.endpoints.get('old-two')?.provider_id).toBe('claude-on-aws')
  expect(scan.endpoints.get('old-bedrock')?.provider_tag).toBe('amazon-bedrock/claude-on-aws')
  expect(scan.providers.get('claude-on-aws')).toEqual({
    provider_id: 'claude-on-aws',
    name: 'Claude Platform on AWS',
    displayName: 'Claude Platform on AWS',
    byokEnabled: false,
    dataPolicy: { privacyPolicyURL: 'https://anthropic.example/privacy' },
  })
})

test('ModelRun metadata transitions remain updates to one provider', () => {
  const previous = extract(
    captured([
      endpoint('modelrun-endpoint', 'model-run', {
        displayName: 'ModelRun',
        dataPolicy: { privacyPolicyURL: 'https://old.example/privacy' },
      }),
    ]),
  )
  const next = extract(
    captured(
      [
        endpoint('modelrun-endpoint', 'modelrun', {
          displayName: 'ModelRun [by Modular]',
          dataPolicy: { privacyPolicyURL: 'https://new.example/privacy' },
        }),
      ],
      '2026-10-08T01:00:00.000Z',
    ),
  )
  const events = prepare({ previous, next })
  const providers = events.filter((event) => event.entity_kind === 'provider')

  expect(providers).toHaveLength(1)
  expect(providers[0]).toMatchObject({ entity_id: 'modelrun', type: 'UPDATE' })
  expect(providers[0].change_json).toContain('https://old.example/privacy')
  expect(providers[0].change_json).toContain('https://new.example/privacy')
  expect(next.endpoints.get('modelrun-endpoint')?.provider_id).toBe('modelrun')
})

function captured(
  endpoints: RawScan['entries'][number]['endpoints'],
  scan_at = '2026-10-08T00:00:00.000Z',
): RawScan {
  return {
    scan_at,
    entries: [
      {
        model_id: 'author/model',
        variant: 'standard',
        model: {
          slug: 'author/model',
          permaslug: 'author/model',
          short_name: 'Model',
          created_at: '2026-01-01T00:00:00.000Z',
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
        endpoints,
      },
    ],
  }
}

function endpoint(
  id: string,
  slug: string,
  facts: Record<string, unknown> = {},
): NonNullable<RawScan['entries'][number]['endpoints']>[number] {
  return {
    id,
    model_variant_slug: 'author/model',
    variant: 'standard',
    provider_slug: slug,
    provider_info: { slug, displayName: 'Provider', ...facts },
    provider_display_name: 'Endpoint label',
    pricing: { discount: 0, prompt: '0.000001', completion: '0.000002' },
    status: 'online',
  }
}
