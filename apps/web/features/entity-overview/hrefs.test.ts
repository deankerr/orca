import { describe, expect, it } from 'bun:test'

import { buildMonitorHref } from './hrefs'

describe('overview action hrefs', () => {
  const gridSearch =
    'q=openai/gpt-5.4&uuid=abc123&has=reasoning&not=image&sort=price&order=asc&pricing-history=openai/gpt-5.4'

  const monitorSearch = 'model=openai/gpt-5.4&provider=akashml&pricing-history=openai/gpt-5.4'

  it('merges Monitor on the monitor page and keeps the other filter', () => {
    expect(
      buildMonitorHref({
        pathname: '/monitor',
        searchParams: monitorSearch,
        type: 'model',
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/monitor?model=z-ai%2Fglm-5.2&provider=akashml')

    expect(
      buildMonitorHref({
        pathname: '/monitor',
        searchParams: monitorSearch,
        type: 'provider',
        slug: 'deepinfra/fp4',
      }),
    ).toBe('/monitor?model=openai%2Fgpt-5.4&provider=deepinfra')
  })

  it('resets to only the destination filter when Monitor leaves the page', () => {
    expect(
      buildMonitorHref({
        pathname: '/',
        searchParams: gridSearch,
        type: 'model',
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/monitor?model=z-ai%2Fglm-5.2')

    expect(
      buildMonitorHref({
        pathname: '/',
        searchParams: gridSearch,
        type: 'provider',
        slug: 'akashml',
      }),
    ).toBe('/monitor?provider=akashml')
  })

  it('strips pricing-history from destination actions', () => {
    expect(
      buildMonitorHref({
        pathname: '/monitor',
        searchParams: monitorSearch,
        type: 'provider',
        slug: 'akashml',
      }),
    ).toBe('/monitor?model=openai%2Fgpt-5.4&provider=akashml')
  })
})
