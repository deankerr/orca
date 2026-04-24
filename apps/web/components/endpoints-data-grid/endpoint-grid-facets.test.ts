import { describe, expect, it } from 'bun:test'

import {
  applyFilterMode,
  countActiveAttributeFilters,
  countActiveModalityFilters,
  toAttributeFilters,
  toFacetFilters,
  toModalityFilters,
} from './use-endpoint-facet-state'

describe('endpoint grid facet helpers', () => {
  it('updates include and exclude modes without leaving stale values behind', () => {
    expect(applyFilterMode({ has: ['tools'], not: [], key: 'tools', mode: 'exclude' })).toEqual({
      has: [],
      not: ['tools'],
    })

    expect(applyFilterMode({ has: [], not: ['tools'], key: 'tools', mode: 'any' })).toEqual({
      has: [],
      not: [],
    })
  })

  it('derives facet filters for row filtering from both has and not', () => {
    expect(toFacetFilters(['tools', 'image_input'], ['disabled'])).toEqual({
      tools: 'include',
      image_input: 'include',
      disabled: 'exclude',
    })
  })

  it('keeps modality filters separate from non-modality attribute filters for UI state', () => {
    expect(toAttributeFilters(['tools', 'image_input'], ['disabled'])).toEqual({
      tools: 'include',
      disabled: 'exclude',
    })

    expect(toModalityFilters(['tools', 'image_input'], ['speech_output'])).toMatchObject({
      image_input: 'include',
      speech_output: 'exclude',
      file_input: 'any',
    })
  })

  it('counts attribute and modality filters independently', () => {
    expect(countActiveAttributeFilters(['tools', 'image_input'], ['disabled'])).toBe(2)
    expect(countActiveModalityFilters(['tools', 'image_input'], ['speech_output'])).toBe(2)
  })
})
