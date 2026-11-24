import type { Endpoint } from '@orca/contract/endpoint'
import { properties } from '@orca/properties'
import { describe, expect, it } from 'vitest'

import { AT, endpoint, models, providers } from '#endpoints/fixtures.testing'
import { buildRows } from '#endpoints/snapshot'

import { providerTags } from './tags'

/** The tags of one endpoint with the given Contract fields set. */
function tagsOf(changes: Partial<Endpoint>) {
  const served = {
    ...endpoint({ id: 'gpt-openai', model: models.gpt, provider: providers.openai }),
    ...changes,
  }

  return buildRows({
    as_at: AT,
    endpoints: [served],
    models: [models.gpt],
    providers: [providers.openai],
  }).flatMap(providerTags)
}

const labels = (changes: Partial<Endpoint>) => tagsOf(changes).map((tag) => tag.label)

describe('providerTags', () => {
  it('lists the region, then quantization, then the service tier', () => {
    expect(
      labels({ provider_region: 'us-east-1', quantization: 'fp8', service_tier: 'flex' }),
    ).toEqual(['us-east-1', 'FP8', 'flex'])
  })

  it('shows the region whenever the endpoint reports one', () => {
    expect(labels({ provider_region: 'swedencentral' })).toEqual(['swedencentral'])
    expect(labels({ provider_region: null, service_tier: 'priority' })).toEqual(['priority'])
  })

  it('explains the region in the Region property’s words, and no other tag', () => {
    const { description, name } = properties.region

    expect(
      tagsOf({ provider_region: 'eu', quantization: 'fp8', service_tier: 'flex' }).map(
        (tag) => tag.hint,
      ),
    ).toEqual([`${name}: ${description}`, undefined, undefined])
    expect(description).toContain('does not establish data residency')
  })

  it('omits unknown and absent quantization', () => {
    expect(labels({ quantization: 'unknown', service_tier: null })).toEqual([])
    expect(labels({ quantization: 'Unknown', service_tier: 'priority' })).toEqual(['priority'])
    expect(labels({ quantization: null, service_tier: null })).toEqual([])
    expect(labels({ quantization: ' ', service_tier: '' })).toEqual([])
  })
})
