import { describe, expect, it } from 'vitest'

import { payload } from '#endpoints/fixtures.testing'
import { buildRows } from '#endpoints/snapshot'

import { snapshotOptions, createOptionSearch, listMeta, optionKey, orderOptions } from './options'
import type { FacetOption } from './options'

const options = snapshotOptions(buildRows(payload))

describe('snapshotOptions', () => {
  it('lists each model and provider once, with display names', () => {
    expect(options.model.map(({ id }) => id)).toEqual([
      'openai/gpt-5',
      'openai/gpt-5:free',
      'moonshotai/kimi-k3',
    ])
    expect(options.provider.map(({ name }) => name)).toEqual(['OpenAI', 'Azure', 'DeepInfra'])
  })
})

describe('orderOptions', () => {
  const pick = (id: string) => {
    const found = options.model.find((option) => option.id === id)

    if (found === undefined) {
      throw new Error(`No fixture model ${id}`)
    }

    return found
  }

  const counts = new Map([
    ['openai/gpt-5', 2],
    ['moonshotai/kimi-k3', 5],
  ])

  const ids = (pinned: string[], matches?: FacetOption[]) => {
    const ordered = orderOptions('model', options.model, counts, pinned, matches)

    return { pinned: ordered.pinned.map(({ id }) => id), rest: ordered.rest.map(({ id }) => id) }
  }

  it('lists every value by count descending, then by name', () => {
    expect(ids([])).toEqual({
      pinned: [],
      rest: ['moonshotai/kimi-k3', 'openai/gpt-5', 'openai/gpt-5:free'],
    })
  })

  it('breaks count ties by name', () => {
    const ordered = orderOptions('provider', options.provider, new Map(), [])

    expect(ordered.rest.map(({ name }) => name)).toEqual(['Azure', 'DeepInfra', 'OpenAI'])
  })

  it('pins the given values first, each group in the same order', () => {
    expect(ids(['openai/gpt-5:free', 'openai/gpt-5'])).toEqual({
      pinned: ['openai/gpt-5', 'openai/gpt-5:free'],
      rest: ['moonshotai/kimi-k3'],
    })
  })

  it('lists a pinned value the catalogue lacks, under its id', () => {
    const ordered = orderOptions('model', options.model, counts, ['gone/x'])

    expect(ordered.pinned).toEqual([{ id: 'gone/x', kind: 'model', listed: 0, name: 'gone/x' }])
    expect(ordered.rest).toHaveLength(3)
  })

  it('lists only the matches when filtered, in the search order', () => {
    const [gpt, free, kimi] = [
      pick('openai/gpt-5'),
      pick('openai/gpt-5:free'),
      pick('moonshotai/kimi-k3'),
    ] as const

    expect(ids(['openai/gpt-5:free', 'gone/x'], [kimi, gpt]).rest).toEqual([
      'moonshotai/kimi-k3',
      'openai/gpt-5',
    ])
    expect(ids(['openai/gpt-5'], [kimi, gpt, free])).toEqual({
      pinned: ['openai/gpt-5'],
      rest: ['moonshotai/kimi-k3', 'openai/gpt-5:free'],
    })
  })

  it('lists zero-count matches after the others in each group, keeping search order', () => {
    const [gpt, free, kimi] = [
      pick('openai/gpt-5'),
      pick('openai/gpt-5:free'),
      pick('moonshotai/kimi-k3'),
    ] as const

    // The search ranks the zero-count model first; the counts are 2, 0 and 5.
    expect(ids([], [free, gpt, kimi])).toEqual({
      pinned: [],
      rest: ['openai/gpt-5', 'moonshotai/kimi-k3', 'openai/gpt-5:free'],
    })
    expect(ids(['openai/gpt-5:free', 'openai/gpt-5'], [free, gpt, kimi])).toEqual({
      pinned: ['openai/gpt-5', 'openai/gpt-5:free'],
      rest: ['moonshotai/kimi-k3'],
    })
  })
})

describe('listMeta', () => {
  const noun = { plural: 'models', singular: 'model' }

  it('shows the total when nothing is selected', () => {
    expect(listMeta(0, 212, noun)).toEqual({ label: '212 models', text: '212' })
  })

  it('shows the selected share of the total', () => {
    expect(listMeta(3, 212, noun)).toEqual({ label: '3 of 212 models selected', text: '3 of 212' })
  })

  it('uses the singular for one value', () => {
    expect(listMeta(0, 1, noun).label).toBe('1 model')
  })
})

describe('createOptionSearch', () => {
  const search = createOptionSearch([...options.model, ...options.provider])

  it('matches slugs and display names by prefix', () => {
    expect(search('kimi').map(({ id }) => id)).toEqual(['moonshotai/kimi-k3'])
    expect(search('gpt 5').map(({ id }) => id)).toContain('openai/gpt-5')
    expect(search('deep').map(({ id }) => id)).toEqual(['deepinfra'])
  })

  it('finds models and providers together', () => {
    expect(search('openai').map(optionKey)).toEqual([
      'provider:openai',
      'model:openai/gpt-5',
      'model:openai/gpt-5:free',
    ])
  })

  it('returns nothing for a blank query', () => {
    expect(search('  ')).toEqual([])
  })

  it('caps the results at the limit, and has none by default', () => {
    expect(search('openai', 1)).toHaveLength(1)
    expect(search('openai')).toHaveLength(3)
  })
})
