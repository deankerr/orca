import { ok } from 'node:assert/strict'

import { expect, test } from 'vitest'

import type { RawScan } from './collected'
import { extractScan as fromCollected } from './extraction/extract'
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
      assembleProviders([ProviderInput.parse({ displayName: 'Provider', slug })]).get(id),
    ).toEqual({
      displayName: 'Provider',
      provider_id: id,
    })
  }
})

test('omits endpoint policy defaults while preserving other provider facts', () => {
  const input = {
    adapterName: 'Adapter',
    baseUrl: 'https://example.test',
    byokEnabled: true,
    dataPolicy: {
      canPublish: false,
      futurePolicy: { disclosure: true },
      paidModels: { training: true },
      privacyPolicyURL: null,
      requiresUserIDs: true,
      retainsPrompts: true,
      retentionDays: 30,
      termsOfServiceURL: 'https://example.test/terms',
      training: true,
      trainingOpenRouter: true,
    },
    datacenters: ['US'],
    displayName: 'Provider',
    editors: [],
    futureFact: { nested: ['value'] },
    hasChatCompletions: true,
    hasCompletions: true,
    headquarters: null,
    icon: { className: 'invert', url: 'icon.svg' },
    ignoredProviderModels: ['model'],
    isAbortable: true,
    isMultipartSupported: true,
    isPrivate: false,
    moderationRequired: false,
    name: 'Provider',
    owners: [],
    pricingStrategy: 'strategy',
    regionOverrides: { us: 'internal' },
    requiredAttestationTypes: [],
    sendClientIp: false,
    slug: 'provider',
    statusPageUrl: null,
  }
  const before = structuredClone(input)
  const provider = assembleProviders([ProviderInput.parse(input)]).get('provider')
  ok(provider)

  expect(provider).toEqual({
    ...Object.fromEntries(
      Object.entries(input).filter(([key]) => key !== 'slug' && key !== 'dataPolicy'),
    ),
    byokEnabled: true,
    dataPolicy: {
      futurePolicy: { disclosure: true },
      privacyPolicyURL: null,
      termsOfServiceURL: 'https://example.test/terms',
    },
    datacenters: ['US'],
    displayName: 'Provider',
    futureFact: { nested: ['value'] },
    headquarters: null,
    name: 'Provider',
    provider_id: 'provider',
    sendClientIp: false,
    statusPageUrl: null,
  })
  expect(input).toEqual(before)
  expect(ProviderInput.parse({ displayName: 'Provider', slug: 'p' })).not.toHaveProperty(
    'dataPolicy',
  )
  expect(
    ProviderInput.parse({ dataPolicy: null, displayName: 'Provider', slug: 'p' }),
  ).toMatchObject({ dataPolicy: null })
  expect(
    ProviderInput.parse({ dataPolicy: { training: true }, displayName: 'Provider', slug: 'p' }),
  ).toHaveProperty('dataPolicy', {})
})

test('canonical observations outrank variants; name frequency and ties ignore input order', () => {
  const observations = [
    { displayName: 'Azure EU', headquarters: 'EU', slug: 'azure/eu' },
    { displayName: 'Azure EU', headquarters: 'EU', slug: 'azure/eu' },
    { displayName: 'Azure (BYOK Only)', headquarters: 'US', slug: 'azure' },
    { displayName: 'Azure', headquarters: 'US', slug: 'azure' },
    { displayName: 'Azure', headquarters: 'US', slug: 'azure' },
  ].map((body) => ProviderInput.parse(body))

  const expected = { displayName: 'Azure', headquarters: 'US', provider_id: 'azure' }
  expect(assembleProviders(observations).get('azure')).toEqual(expected)
  expect(assembleProviders(observations.toReversed()).get('azure')).toEqual(expected)

  const fallback = [
    ProviderInput.parse({ displayName: 'Azure US', slug: 'azure/us' }),
    ProviderInput.parse({ displayName: 'Azure EU', slug: 'azure/eu' }),
  ]
  expect(assembleProviders(fallback).get('azure')).toEqual({
    displayName: 'Azure EU',
    provider_id: 'azure',
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
    displayName: 'Azure',
    provider_id: 'azure',
    statusPageUrl: 'https://a.example',
  })
  expect(fromCollected(captured(endpoints.toReversed())).providers.get('azure')).toEqual(selected)
  expect(endpoints).toEqual(before)

  const unselectedChanged = endpoints.map((item) =>
    item.id === 'b'
      ? endpoint('b', 'azure', {
          displayName: 'Azure',
          futureFact: ['z', 'a'],
          statusPageUrl: 'https://b.example',
        })
      : item,
  )
  expect(fromCollected(captured(unselectedChanged)).providers.get('azure')).toEqual(selected)

  const selectedChanged = endpoints.map((item) =>
    item.id === 'a'
      ? endpoint('a', 'azure', {
          displayName: 'Azure',
          futureFact: ['z', 'a'],
          statusPageUrl: 'https://changed.example',
        })
      : item,
  )
  expect(fromCollected(captured(selectedChanged)).providers.get('azure')).toEqual({
    displayName: 'Azure',
    futureFact: ['z', 'a'],
    provider_id: 'azure',
    statusPageUrl: 'https://changed.example',
  })
})

test('extraction preserves endpoint facts and raw inputs while grouping providers', () => {
  const base = endpoint('base', 'azure', { name: 'Azure' })
  const regional = endpoint('regional', 'azure/eu', {
    displayName: 'Azure EU',
    name: 'An inconsistent upstream name',
  })
  regional.provider_slug = 'azure/swedencentral'
  regional.data_policy = { retainsPrompts: true, training: true }
  const raw = captured([base, regional])
  const before = structuredClone(raw)
  const scan = fromCollected(raw)

  expect([...scan.providers.keys()]).toEqual(['azure'])
  expect(scan.providers.get('azure')).toEqual({
    displayName: 'Provider',
    name: 'Azure',
    provider_id: 'azure',
  })
  expect(scan.endpoints.get('regional')).toMatchObject({
    data_policy: { retainsPrompts: true, training: true },
    id: 'regional',
    provider_display_name: 'Endpoint label',
    provider_id: 'azure',
    provider_tag: 'azure/swedencentral',
  })
  expect(scan.endpoints.get('regional')).not.toHaveProperty('status')
  expect(scan.endpoints.get('regional')).not.toHaveProperty('provider_info')
  expect(raw).toEqual(before)
})

test('Claude on AWS repairs precede prefix grouping without merging its ordinary parent providers', () => {
  const scan = fromCollected(
    captured([
      endpoint('anthropic', 'anthropic', { displayName: 'Anthropic' }),
      endpoint('bedrock', 'amazon-bedrock', { displayName: 'Amazon Bedrock' }),
      endpoint('old-two', 'anthropic/2', { displayName: 'Anthropic 2' }),
      endpoint('old-anthropic', 'anthropic/claude-on-aws', {
        byokEnabled: true,
        dataPolicy: { privacyPolicyURL: 'https://aws.example/privacy' },
        name: 'Amazon Bedrock',
      }),
      endpoint('old-bedrock', 'amazon-bedrock/claude-on-aws', { name: 'Amazon Bedrock' }),
      endpoint('canonical', 'claude-on-aws', {
        byokEnabled: false,
        dataPolicy: { privacyPolicyURL: 'https://anthropic.example/privacy' },
        displayName: 'Claude Platform on AWS',
        name: 'Claude Platform on AWS',
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
    byokEnabled: false,
    dataPolicy: { privacyPolicyURL: 'https://anthropic.example/privacy' },
    displayName: 'Claude Platform on AWS',
    name: 'Claude Platform on AWS',
    provider_id: 'claude-on-aws',
  })
})

function captured(
  endpoints: RawScan['entries'][number]['endpoints'],
  scan_at = '2026-10-08T00:00:00.000Z',
): RawScan {
  return {
    entries: [
      {
        endpoints,
        model: {
          created_at: '2026-01-01T00:00:00.000Z',
          input_modalities: ['text'],
          output_modalities: ['text'],
          permaslug: 'author/model',
          short_name: 'Model',
          slug: 'author/model',
        },
        model_id: 'author/model',
        variant: 'standard',
      },
    ],
    scan_at,
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
    pricing: { completion: '0.000002', discount: 0, prompt: '0.000001' },
    provider_display_name: 'Endpoint label',
    provider_info: { displayName: 'Provider', slug, ...facts },
    provider_slug: slug,
    status: 'online',
    variant: 'standard',
  }
}
