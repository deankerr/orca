import { describe, expect, it } from 'bun:test'

import { buildEndpointGridHref, buildEndpointsHref } from './links'

describe('fresh endpoint grid links', () => {
  it('omits an empty q param', () => {
    expect(buildEndpointGridHref({ query: '   ' })).toBe('/')
  })

  it('includes trimmed query and UUID params', () => {
    expect(buildEndpointGridHref({ query: '  openai/gpt-5.4  ', uuid: ' abc123 ' })).toBe(
      '/?q=openai%2Fgpt-5.4&uuid=abc123',
    )
  })
})

describe('contextual endpoint grid links', () => {
  const gridSearch =
    'q=openai/gpt-5.4&uuid=abc123&has=reasoning&not=image&sort=price&order=asc&pricing-history=openai/gpt-5.4'

  it('keeps facets and sort when navigating within the grid', () => {
    expect(
      buildEndpointsHref({ pathname: '/', searchParams: gridSearch, slug: 'z-ai/glm-5.2' }),
    ).toBe('/?q=z-ai%2Fglm-5.2&has=reasoning&not=image&sort=price&order=asc')
  })

  it('drops uuid when the query changes', () => {
    expect(
      buildEndpointsHref({
        pathname: '/',
        searchParams: 'q=openai/gpt-5.4&uuid=abc123&has=reasoning',
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2&has=reasoning')
  })

  it('keeps uuid when the query is unchanged', () => {
    expect(
      buildEndpointsHref({
        pathname: '/',
        searchParams: 'q=z-ai/glm-5.2&uuid=abc123&has=reasoning',
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2&uuid=abc123&has=reasoning')
  })

  it('uses only q when navigating from another route', () => {
    expect(
      buildEndpointsHref({
        pathname: '/monitor',
        searchParams: 'model=openai/gpt-5.4&provider=akashml&pricing-history=openai/gpt-5.4',
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2')
  })

  it('strips pricing-history without mutating the current parameters', () => {
    const current = new URLSearchParams(gridSearch)
    const before = current.toString()
    expect(
      buildEndpointsHref({ pathname: '/', searchParams: current, slug: 'openai/gpt-5.4' }),
    ).toBe('/?q=openai%2Fgpt-5.4&uuid=abc123&has=reasoning&not=image&sort=price&order=asc')
    expect(current.toString()).toBe(before)
  })
})
