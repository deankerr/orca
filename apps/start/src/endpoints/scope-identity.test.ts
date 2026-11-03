import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  stripSearchParams,
} from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { stringifySearch } from '#lib/url-search-serializer'

import { scopeDefaults, scopeSchema } from './scope'
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
})
