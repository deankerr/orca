import { describe, expect, it } from 'vitest'

import { propertyFacetGroups } from './facets'
import { payload } from './fixtures.testing'
import { buildRows } from './snapshot'

describe('propertyFacetGroups', () => {
  const groups = propertyFacetGroups(buildRows(payload))
  const ids = groups.flatMap(({ facets }) => facets.map(({ id }) => id))

  it('offers active properties grouped in catalogue order', () => {
    expect(groups.map(({ label }) => label)).toEqual([
      'Tools',
      'Data Policy',
      'Commercial',
      'Status',
      'Pricing',
    ])
    expect(ids).toEqual(['tools', 'zdr', 'free', 'new_model', 'cache_read'])
  })

  it('leaves out unlisted, which has its own toggle', () => {
    expect(ids).not.toContain('unlisted')
  })
})
