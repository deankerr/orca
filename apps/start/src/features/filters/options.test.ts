import { describe, expect, it } from 'vitest'

import { snapshot } from '#features/endpoints/fixtures.testing'
import { buildRows } from '#features/endpoints/rows'

import { catalogOptions, createOptionSearch, optionKey, visibleOptions } from './options'

const options = catalogOptions(buildRows(snapshot))

describe('catalogOptions', () => {
  it('lists each model and provider once, with display names', () => {
    expect(options.model.map(({ id }) => id)).toEqual([
      'openai/gpt-5',
      'openai/gpt-5:free',
      'moonshotai/kimi-k3',
    ])
    expect(options.provider.map(({ name }) => name)).toEqual(['OpenAI', 'Azure', 'DeepInfra'])
  })
})

describe('visibleOptions', () => {
  const counts = new Map([
    ['openai/gpt-5', 2],
    ['moonshotai/kimi-k3', 5],
  ])

  const ids = (selected: string[], top: number) =>
    visibleOptions('model', options.model, counts, selected, top).map(({ id }) => id)

  it('shows the highest counts first', () => {
    expect(ids([], 2)).toEqual(['moonshotai/kimi-k3', 'openai/gpt-5'])
  })

  it('puts selected values first, then fills with the highest counts', () => {
    expect(ids(['openai/gpt-5'], 1)).toEqual(['openai/gpt-5', 'moonshotai/kimi-k3'])
  })

  it('keeps a selected value with a zero count, and one the catalogue lacks', () => {
    const shown = visibleOptions('model', options.model, counts, ['openai/gpt-5:free', 'gone/x'], 1)

    expect(shown.map(({ id }) => id)).toEqual(['openai/gpt-5:free', 'gone/x', 'moonshotai/kimi-k3'])
    expect(shown[1]).toMatchObject({ kind: 'model', name: 'gone/x' })
  })

  it('breaks ties in catalogue order', () => {
    expect(
      visibleOptions('provider', options.provider, new Map(), [], 2).map(({ id }) => id),
    ).toEqual(['openai', 'azure'])
  })
})

describe('createOptionSearch', () => {
  const search = createOptionSearch([...options.model, ...options.provider])

  it('matches slugs and display names by prefix', () => {
    expect(search('kimi', 5).map(({ id }) => id)).toEqual(['moonshotai/kimi-k3'])
    expect(search('gpt 5', 5).map(({ id }) => id)).toContain('openai/gpt-5')
    expect(search('deep', 5).map(({ id }) => id)).toEqual(['deepinfra'])
  })

  it('finds models and providers together', () => {
    expect(search('openai', 5).map(optionKey)).toEqual([
      'provider:openai',
      'model:openai/gpt-5',
      'model:openai/gpt-5:free',
    ])
  })

  it('returns nothing for a blank query', () => {
    expect(search('  ', 5)).toEqual([])
  })

  it('leaves out excluded options and caps the results', () => {
    expect(search('openai', 5, new Set(['provider:openai'])).map(optionKey)).toEqual([
      'model:openai/gpt-5',
      'model:openai/gpt-5:free',
    ])
    expect(search('openai', 1)).toHaveLength(1)
  })
})
