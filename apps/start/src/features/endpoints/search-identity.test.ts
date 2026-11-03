import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  stripSearchParams,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { stringifySearch } from '#lib/search'

import { endpointSearchDefaults, endpointSearchSchema } from './search'
import type { EndpointSearch } from './search'

/**
 * `useFilteredRows` memoizes on the filter params' identities, so the router must hand out the same
 * array for a param that did not change. These tests drive the index route's search options through
 * a real router to hold it to that.
 */
async function startRouter(url: string) {
  const rootRoute = createRootRoute()

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    search: { middlewares: [stripSearchParams(endpointSearchDefaults)] },
    validateSearch: endpointSearchSchema,
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

  const search = (): EndpointSearch => {
    const match = router.state.matches.find((candidate) => candidate.routeId === indexRoute.id)

    if (match === undefined) {
      throw new Error('The index route did not match')
    }

    return match.search
  }

  const change = async (update: Partial<EndpointSearch>) => {
    await router.navigate({
      from: '/',
      replace: true,
      search: (previous) => ({ ...previous, ...update }),
      to: '/',
    })
  }

  return { change, search }
}

describe('index route search identity', () => {
  it('keeps list params when only the selection or the plot toggle changes', async () => {
    const { change, search } = await startRouter(
      '/?provider=azure,openai&model=openai/gpt-5&with=tools&without=zdr',
    )

    const before = search()

    expect(before.provider).toEqual(['azure', 'openai'])

    await change({ endpoint: 'abc' })
    expect(search().endpoint).toBe('abc')

    await change({ plot: false })
    expect(search().plot).toBe(false)

    const after = search()

    expect(after).not.toBe(before)
    expect(after.provider).toBe(before.provider)
    expect(after.model).toBe(before.model)
    expect(after.with).toBe(before.with)
    expect(after.without).toBe(before.without)
  })

  it('keeps default lists across a navigation', async () => {
    const { change, search } = await startRouter('/')
    const before = search()

    await change({ endpoint: 'abc' })

    expect(search().provider).toBe(before.provider)
    expect(search().with).toBe(before.with)
  })

  it('replaces only the list that changed', async () => {
    const { change, search } = await startRouter('/?provider=azure&model=openai/gpt-5')
    const before = search()

    await change({ provider: ['azure', 'openai'] })

    expect(search().provider).toEqual(['azure', 'openai'])
    expect(search().model).toBe(before.model)
  })
})
