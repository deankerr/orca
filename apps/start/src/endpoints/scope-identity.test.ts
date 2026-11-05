import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  replaceEqualDeep,
  stripSearchParams,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { stringifySearch } from '#lib/url-search-serializer'

import { propertyFilters, scopeDefaults, scopeFilters, scopeSchema } from './scope'
import type { Scope } from './scope'

/**
 * `useScopedRows` memoizes on the filter params' identities, so the router must hand out the same
 * array for a param that did not change. These tests drive the index route's scope options through
 * a real router to hold it to that.
 */
async function startRouter(url: string) {
  const rootRoute = createRootRoute()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    search: { middlewares: [stripSearchParams(scopeDefaults)] },
    validateSearch: scopeSchema,
  })

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [url] }),
    // Server routers keep no match state between navigations; the browser's router is what is under test.
    isServer: false,
    origin: 'http://localhost',
    routeTree: rootRoute.addChildren([indexRoute]),
    stringifySearch,
  })

  await router.load()

  const scope = (): Scope => {
    const match = router.state.matches.find((candidate) => candidate.routeId === indexRoute.id)

    if (match === undefined) {
      throw new Error('The index route did not match')
    }

    return match.search
  }

  const change = async (update: Partial<Scope>) => {
    await router.navigate({
      from: '/',
      replace: true,
      search: (previous) => ({ ...previous, ...update }),
      to: '/',
    })
  }

  return { change, scope }
}

describe('index route scope identity', () => {
  it('keeps list params when only the selection or the plot toggle changes', async () => {
    const { change, scope } = await startRouter(
      '/?provider=azure,openai&model=openai/gpt-5&with=tools&without=zdr',
    )

    const before = scope()

    expect(before.provider).toEqual(['azure', 'openai'])

    await change({ endpoint: 'abc' })
    expect(scope().endpoint).toBe('abc')

    await change({ plot: false })
    expect(scope().plot).toBe(false)

    const after = scope()

    expect(after).not.toBe(before)
    expect(after.provider).toBe(before.provider)
    expect(after.model).toBe(before.model)
    expect(after.with).toBe(before.with)
    expect(after.without).toBe(before.without)
  })

  it('keeps default lists across a navigation', async () => {
    const { change, scope } = await startRouter('/')
    const before = scope()

    await change({ endpoint: 'abc' })

    expect(scope().provider).toBe(before.provider)
    expect(scope().with).toBe(before.with)
  })

  it('replaces only the list that changed', async () => {
    const { change, scope } = await startRouter('/?provider=azure&model=openai/gpt-5')
    const before = scope()

    await change({ provider: ['azure', 'openai'] })

    expect(scope().provider).toEqual(['azure', 'openai'])
    expect(scope().model).toBe(before.model)
  })

  // The filter hooks select a fresh object and let the router's structural sharing (`replaceEqualDeep`
  // against the previous selection) hand back the old one while every filter is equal.
  it('shares the filters selection across changes that leave the filters alone', async () => {
    const { change, scope } = await startRouter('/?provider=azure&model=openai/gpt-5&maxInput=2')
    const selected = replaceEqualDeep(undefined, scopeFilters(scope()))

    await change({ endpoint: 'abc' })
    await change({ plot: false })
    await change({ sort: 'output' })

    expect(replaceEqualDeep(selected, scopeFilters(scope()))).toBe(selected)

    await change({ maxInput: 3 })

    const bounded = replaceEqualDeep(selected, scopeFilters(scope()))

    expect(bounded).not.toBe(selected)
    expect(bounded.maxInput).toBe(3)
    expect(bounded.model).toBe(selected.model)
  })

  it('shares the property filters selection until a property list changes', async () => {
    const { change, scope } = await startRouter('/?with=tools')
    const selected = replaceEqualDeep(undefined, propertyFilters(scope()))

    await change({ model: ['openai/gpt-5'] })
    expect(replaceEqualDeep(selected, propertyFilters(scope()))).toBe(selected)

    await change({ without: ['zdr'] })
    expect(replaceEqualDeep(selected, propertyFilters(scope()))).not.toBe(selected)
  })
})
