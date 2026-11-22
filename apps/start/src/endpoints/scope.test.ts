import { defaultWorkload, matchingPreset, workloadPresets } from '@orca/pricing'
import { stripSearchParams } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { stringifySearch } from '#lib/url-search-serializer'

import type { Scope } from './scope'
import {
  activeFilterCount,
  clearedFilters,
  propertyFilters,
  scopeDefaults,
  scopeFilters,
  scopeSchema,
  scopeWorkload,
  propertyState,
  setPropertyState,
  toggleValue,
  workloadParams,
} from './scope'

describe('scopeSchema', () => {
  it('fills defaults for a bare URL', () => {
    expect(scopeSchema.parse({})).toEqual(scopeDefaults)
  })

  it('splits comma lists, including single values the router parsed as other types', () => {
    expect(
      scopeSchema.parse({ model: 'openai/gpt-5,openai/gpt-5:free', provider: ['azure'] }),
    ).toMatchObject({
      model: ['openai/gpt-5', 'openai/gpt-5:free'],
      provider: ['azure'],
    })
    expect(scopeSchema.parse({ provider: 302 }).provider).toEqual(['302'])
    expect(scopeSchema.parse({ model: 'a,,a,b' }).model).toEqual(['a', 'b'])
  })

  it('reads bounds, windows, toggles, sort, and selection', () => {
    expect(
      scopeSchema.parse({
        endpoint: 'gpt-openai',
        hit: 75,
        maxInput: 2.5,
        minContext: 128_000,
        minTps: 50,
        plot: false,
        ratio: 10,
        released: 6,
        sort: '-throughput',
        unlisted: true,
      }),
    ).toMatchObject({
      endpoint: 'gpt-openai',
      hit: 75,
      maxInput: 2.5,
      minContext: 128_000,
      minTps: 50,
      plot: false,
      ratio: 10,
      released: 6,
      sort: '-throughput',
      unlisted: true,
    })
  })

  it('falls back to defaults for invalid values instead of failing', () => {
    expect(
      scopeSchema.parse({
        endpoint: '',
        hit: 101,
        maxInput: -1,
        minTps: 'fast',
        model: { nested: true },
        plot: 'yes',
        ratio: 0,
        released: 2,
        sort: 'price',
        unlisted: 1,
      }),
    ).toEqual(scopeDefaults)
  })

  it('falls back to the default workload for each invalid number on its own', () => {
    for (const hit of [-1, 101, 50.5, 'high', null]) {
      expect(scopeSchema.parse({ hit, ratio: 10 })).toMatchObject({ hit: 90, ratio: 10 })
    }

    for (const ratio of [0, -3, 1001, 'many', null]) {
      expect(scopeSchema.parse({ hit: 75, ratio })).toMatchObject({ hit: 75, ratio: 100 })
    }
  })

  it('keeps the extremes of the workload params', () => {
    expect(scopeSchema.parse({ hit: 0, ratio: 0.5 })).toMatchObject({ hit: 0, ratio: 0.5 })
    expect(scopeSchema.parse({ hit: 100, ratio: 1000 })).toMatchObject({ hit: 100, ratio: 1000 })
  })

  it('keeps a zero maximum input price, which selects free endpoints', () => {
    expect(scopeSchema.parse({ maxInput: 0 })).toMatchObject({ maxInput: 0 })
  })

  it('drops unknown properties and lets an included property win over its exclusion', () => {
    expect(scopeSchema.parse({ with: 'tools,bogus', without: 'tools,zdr' })).toMatchObject({
      with: ['tools'],
      without: ['zdr'],
    })
  })
})

describe('stripping defaults from URLs', () => {
  const strip = (scope: Scope) =>
    z
      .looseObject({})
      .parse(stripSearchParams(scopeDefaults)({ next: (next) => next, search: scope }))

  it('removes every param at its default', () => {
    expect(strip(scopeSchema.parse({}))).toEqual({})
    expect(stringifySearch(strip(scopeSchema.parse({})))).toBe('')
  })

  it('keeps params away from their defaults, and those with no default', () => {
    expect(
      strip(
        scopeSchema.parse({
          endpoint: 'gpt-openai',
          hit: 0,
          maxInput: 2.5,
          model: ['openai/gpt-5'],
          plot: false,
          ratio: 3,
          sort: '-cost',
          unlisted: true,
          with: ['tools'],
        }),
      ),
    ).toEqual({
      endpoint: 'gpt-openai',
      hit: 0,
      maxInput: 2.5,
      model: ['openai/gpt-5'],
      plot: false,
      ratio: 3,
      sort: '-cost',
      unlisted: true,
      with: ['tools'],
    })
  })

  it('strips only the defaults from a mixed scope', () => {
    expect(
      stringifySearch(strip(scopeSchema.parse({ model: 'a', plot: true, sort: 'input' }))),
    ).toBe('?model=a')
  })
})

describe('filter updates', () => {
  it('toggles list values', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('moves a property between included, excluded, and off', () => {
    const included = setPropertyState({ with: [], without: ['tools'] }, 'tools', 'with')

    expect(included).toEqual({ with: ['tools'], without: [] })
    expect(propertyState(included, 'tools')).toBe('with')
    expect(setPropertyState(included, 'tools', 'without')).toEqual({ with: [], without: ['tools'] })
    expect(propertyState(setPropertyState(included, 'tools', 'off'), 'tools')).toBe('off')
  })

  it('counts each list value, bound, and the unlisted toggle', () => {
    expect(activeFilterCount(clearedFilters)).toBe(0)
    expect(
      activeFilterCount({
        ...clearedFilters,
        maxInput: 1,
        model: ['a', 'b'],
        unlisted: true,
        without: ['zdr'],
      }),
    ).toBe(5)
  })
})

describe('scopeFilters', () => {
  it('keeps the filters and drops the sort, workload, plot toggle, and selection', () => {
    const scope = scopeSchema.parse({
      endpoint: 'abc',
      hit: 50,
      maxInput: 2,
      model: 'openai/gpt-5',
      plot: false,
      ratio: 5,
      sort: 'output',
      unlisted: true,
      with: 'tools',
    })

    const filters = scopeFilters(scope)

    expect(Object.keys(filters).toSorted()).toEqual(Object.keys(clearedFilters).toSorted())
    expect(filters).toMatchObject({
      maxInput: 2,
      model: ['openai/gpt-5'],
      unlisted: true,
      with: ['tools'],
    })
  })

  it('reuses the scope params, so the lists keep their identity', () => {
    const scope = scopeSchema.parse({ model: 'openai/gpt-5', with: 'tools' })
    const filters = scopeFilters(scope)

    expect(filters.model).toBe(scope.model)
    expect(filters.with).toBe(scope.with)
  })

  it('picks the property lists alone', () => {
    const scope = scopeSchema.parse({ model: 'openai/gpt-5', with: 'tools', without: 'zdr' })

    expect(propertyFilters(scope)).toEqual({ with: ['tools'], without: ['zdr'] })
  })
})

describe('workload params', () => {
  it('default to the default workload, so a bare URL is the agentic view', () => {
    expect(scopeWorkload(scopeSchema.parse({}))).toEqual(defaultWorkload)
  })

  it('turn the percent into a hit rate fraction', () => {
    expect(scopeWorkload(scopeSchema.parse({ hit: 75, ratio: 10 }))).toEqual({
      hitRate: 0.75,
      ratio: 10,
    })
    expect(scopeWorkload(scopeSchema.parse({ hit: 0, ratio: 3 }))).toEqual({ hitRate: 0, ratio: 3 })
  })

  it('round-trip every preset', () => {
    for (const { workload } of workloadPresets) {
      const scope = scopeSchema.parse(workloadParams(workload))

      expect(scopeWorkload(scope)).toEqual(workload)
      expect(matchingPreset(scopeWorkload(scope))).toBeDefined()
    }
  })

  it('round a hit rate to a whole percent', () => {
    expect(workloadParams({ hitRate: 0.333, ratio: 4 })).toEqual({ hit: 33, ratio: 4 })
  })

  it('write only the numbers a change names', () => {
    expect(workloadParams({ ratio: 4 })).toEqual({ ratio: 4 })
    expect(workloadParams({ hitRate: 0.5 })).toEqual({ hit: 50 })
    expect(workloadParams({ hitRate: 0 })).toEqual({ hit: 0 })
    expect(workloadParams({})).toEqual({})
  })

  it('keep both of two field commits made before the scope re-rendered', () => {
    // What the search updater does: merge a change into the scope it is handed, which is the latest.
    const commit = (scope: Scope, change: Parameters<typeof workloadParams>[0]): Scope => ({
      ...scope,
      ...workloadParams(change),
    })

    const start = scopeSchema.parse({})
    const afterRatio = commit(start, { ratio: 7 })
    const afterBoth = commit(afterRatio, { hitRate: 0.5 })

    expect(scopeWorkload(afterBoth)).toEqual({ hitRate: 0.5, ratio: 7 })
    // Either order, since each commit carries only its own number.
    expect(scopeWorkload(commit(commit(start, { hitRate: 0.5 }), { ratio: 7 }))).toEqual({
      hitRate: 0.5,
      ratio: 7,
    })
    // Neither commit restores the number the other left alone.
    expect(commit(afterRatio, { hitRate: 0.5 }).ratio).toBe(7)
    expect(commit(start, { ratio: 7 }).hit).toBe(start.hit)
  })

  it('are not filters', () => {
    expect(activeFilterCount(scopeFilters(scopeSchema.parse({ hit: 0, ratio: 3 })))).toBe(0)
    expect(clearedFilters).not.toHaveProperty('ratio')
    expect(clearedFilters).not.toHaveProperty('hit')
  })
})
