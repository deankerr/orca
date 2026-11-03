import { describe, expect, it } from 'vitest'

import { providerTags } from './tags'

describe('providerTags', () => {
  it('lists quantization then service tier', () => {
    expect(providerTags({ quantization: 'fp8', service_tier: 'flex' })).toEqual(['FP8', 'flex'])
  })

  it('omits unknown and absent quantization', () => {
    expect(providerTags({ quantization: 'unknown', service_tier: null })).toEqual([])
    expect(providerTags({ quantization: 'Unknown', service_tier: 'priority' })).toEqual([
      'priority',
    ])
    expect(providerTags({ quantization: null, service_tier: null })).toEqual([])
    expect(providerTags({ quantization: ' ', service_tier: '' })).toEqual([])
  })
})
