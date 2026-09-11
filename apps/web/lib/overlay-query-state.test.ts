import { describe, expect, it } from 'bun:test'

import {
  buildLegacyPricingHistoryHref,
  buildOverviewChartHref,
  buildOverviewEndpointsHref,
  buildOverviewMonitorHref,
  chartModelIdFromParams,
  chartQueryPatch,
} from './overlay-query-state'

describe('chart query patches', () => {
  it('treats blank chart values as closed', () => {
    expect(chartModelIdFromParams('')).toBeNull()
    expect(chartModelIdFromParams('  z-ai/glm-5.2  ')).toBe('z-ai/glm-5.2')
  })

  it('sets chart as its own key', () => {
    expect(chartQueryPatch('z-ai/glm-5.2')).toEqual({ chart: 'z-ai/glm-5.2' })
    expect(chartQueryPatch(null)).toEqual({ chart: null })
  })
})

describe('overview action hrefs', () => {
  const gridSearch =
    'q=openai/gpt-5.4&uuid=abc123&has=reasoning&not=image&sort=price&order=asc&chart=openai/gpt-5.4'
  const monitorSearch = 'model=openai/gpt-5.4&provider=akashml&chart=openai/gpt-5.4'

  it('merges Endpoints on the grid and keeps facets and sort', () => {
    expect(
      buildOverviewEndpointsHref({
        pathname: '/',
        searchParams: gridSearch,
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2&has=reasoning&not=image&sort=price&order=asc')
  })

  it('drops uuid when Endpoints changes q', () => {
    expect(
      buildOverviewEndpointsHref({
        pathname: '/',
        searchParams: 'q=openai/gpt-5.4&uuid=abc123&has=reasoning',
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2&has=reasoning')
  })

  it('keeps uuid when Endpoints q is unchanged', () => {
    expect(
      buildOverviewEndpointsHref({
        pathname: '/',
        searchParams: 'q=z-ai/glm-5.2&uuid=abc123&has=reasoning',
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2&uuid=abc123&has=reasoning')
  })

  it('resets to only q when Endpoints leaves the grid', () => {
    expect(
      buildOverviewEndpointsHref({
        pathname: '/monitor',
        searchParams: monitorSearch,
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2')
  })

  it('merges Monitor on the monitor page and keeps the other filter', () => {
    expect(
      buildOverviewMonitorHref({
        pathname: '/monitor',
        searchParams: monitorSearch,
        type: 'model',
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/monitor?model=z-ai%2Fglm-5.2&provider=akashml')
    expect(
      buildOverviewMonitorHref({
        pathname: '/monitor',
        searchParams: monitorSearch,
        type: 'provider',
        slug: 'deepinfra/fp4',
      }),
    ).toBe('/monitor?model=openai%2Fgpt-5.4&provider=deepinfra')
  })

  it('resets to only the destination filter when Monitor leaves the page', () => {
    expect(
      buildOverviewMonitorHref({
        pathname: '/',
        searchParams: gridSearch,
        type: 'model',
        slug: 'z-ai/glm-5.2',
      }),
    ).toBe('/monitor?model=z-ai%2Fglm-5.2')
    expect(
      buildOverviewMonitorHref({
        pathname: '/',
        searchParams: gridSearch,
        type: 'provider',
        slug: 'akashml',
      }),
    ).toBe('/monitor?provider=akashml')
  })

  it('strips chart from destination actions', () => {
    expect(
      buildOverviewEndpointsHref({
        pathname: '/',
        searchParams: gridSearch,
        slug: 'openai/gpt-5.4',
      }),
    ).toBe('/?q=openai%2Fgpt-5.4&uuid=abc123&has=reasoning&not=image&sort=price&order=asc')
    expect(
      buildOverviewMonitorHref({
        pathname: '/monitor',
        searchParams: monitorSearch,
        type: 'provider',
        slug: 'akashml',
      }),
    ).toBe('/monitor?model=openai%2Fgpt-5.4&provider=akashml')
  })

  it('lets Pricing History add chart to the current page filters', () => {
    expect(
      buildOverviewChartHref({
        pathname: '/',
        searchParams: 'q=z-ai/glm-5.2&has=reasoning',
        modelId: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2&has=reasoning&chart=z-ai%2Fglm-5.2')
    expect(
      buildOverviewChartHref({
        pathname: '/monitor',
        searchParams: 'model=z-ai/glm-5.2',
        modelId: 'z-ai/glm-5.2',
      }),
    ).toBe('/monitor?model=z-ai%2Fglm-5.2&chart=z-ai%2Fglm-5.2')
  })

  it('drops leftover overview keys from Pricing History hrefs', () => {
    expect(
      buildOverviewChartHref({
        pathname: '/',
        searchParams: 'q=z-ai/glm-5.2&overviewModel=z-ai/glm-5.2',
        modelId: 'z-ai/glm-5.2',
      }),
    ).toBe('/?q=z-ai%2Fglm-5.2&chart=z-ai%2Fglm-5.2')
  })

  it('builds a chart-only href when no other state is present', () => {
    expect(
      buildOverviewChartHref({
        pathname: '/',
        searchParams: '',
        modelId: 'z-ai/glm-5.2',
      }),
    ).toBe('/?chart=z-ai%2Fglm-5.2')
  })
})

describe('legacy pricing history redirects', () => {
  it('opens the data-grid overlay for a model id path', () => {
    expect(buildLegacyPricingHistoryHref(['z-ai', 'glm-5.2'])).toBe('/?chart=z-ai%2Fglm-5.2')
  })

  it('decodes a single encoded segment', () => {
    expect(buildLegacyPricingHistoryHref(['z-ai%2Fglm-5.2'])).toBe('/?chart=z-ai%2Fglm-5.2')
  })

  it('falls back to the grid when the path is empty', () => {
    expect(buildLegacyPricingHistoryHref([])).toBe('/')
    expect(buildLegacyPricingHistoryHref(['  '])).toBe('/')
  })
})
