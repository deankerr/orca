import { describe, expect, it } from 'vitest'

import {
  BREAKPOINTS,
  breakpointFloor,
  DOCKED_FILTERS_MEDIA_CLASS,
  ENDPOINT_WIDTH,
  FILTERS_DOCK_WIDTH,
  FILTERS_WIDTH,
  minimumWidth,
  PANEL_GAP,
  panelLayout,
  RESULTS_MIN_WIDTH,
  RESULTS_PEEK_WIDTH,
} from './panel-layout'
import type { PanelLayout } from './panel-layout'

const PAD = 2 * PANEL_GAP

const layout = (filters: PanelLayout['filters'], endpoint: PanelLayout['endpoint']) => ({
  endpoint,
  filters,
})

describe('panelLayout', () => {
  describe('with nothing selected', () => {
    it.each([
      [375, 'sheet'],
      [768, 'sheet'],
      [FILTERS_DOCK_WIDTH - 1, 'sheet'],
      [FILTERS_DOCK_WIDTH, 'docked'],
      [1024, 'docked'],
      [1440, 'docked'],
    ] as const)('puts Filters on a %ipx page in a %s', (width, filters) => {
      expect(panelLayout(width, false).filters).toBe(filters)
    })
  })

  describe('with an endpoint selected', () => {
    it.each([
      [375, layout('sheet', 'sheet')],
      [430, layout('sheet', 'sheet')],
      [768, layout('sheet', 'overlay')],
      [1024, layout('sheet', 'docked')],
      [1440, layout('docked', 'docked')],
    ] as const)('lays out a %ipx page as %o', (width, expected) => {
      expect(panelLayout(width, true)).toEqual(expected)
    })

    it('docks the Endpoint panel before Filters', () => {
      const endpointDocks = PAD + RESULTS_MIN_WIDTH + PANEL_GAP + ENDPOINT_WIDTH

      expect(panelLayout(endpointDocks, true)).toEqual(layout('sheet', 'docked'))
      expect(panelLayout(endpointDocks - 1, true).endpoint).toBe('overlay')
      expect(panelLayout(endpointDocks + PANEL_GAP + FILTERS_WIDTH, true)).toEqual(
        layout('docked', 'docked'),
      )
    })

    it('overlays the Endpoint panel only while Results keeps its peek beside it', () => {
      const overlays = PAD + RESULTS_PEEK_WIDTH + ENDPOINT_WIDTH

      expect(panelLayout(overlays, true).endpoint).toBe('overlay')
      expect(panelLayout(overlays - 1, true).endpoint).toBe('sheet')
    })
  })
})

describe('minimumWidth', () => {
  it('leaves Results its minimum beside every docked Panel', () => {
    expect(minimumWidth(layout('docked', 'docked'), true)).toBe(
      PAD + FILTERS_WIDTH + PANEL_GAP + RESULTS_MIN_WIDTH + PANEL_GAP + ENDPOINT_WIDTH,
    )
  })

  it('gives an unselected Endpoint panel no room', () => {
    expect(minimumWidth(layout('docked', 'docked'), false)).toBe(
      minimumWidth(layout('docked', 'sheet'), true),
    )
  })
})

describe('breakpointFloor', () => {
  it('keeps the layout of every width it floors', () => {
    for (let width = 0; width <= 1600; width += 1) {
      for (const shown of [false, true]) {
        expect(panelLayout(breakpointFloor(width), shown)).toEqual(panelLayout(width, shown))
      }
    }
  })

  it('lists each breakpoint once, ascending', () => {
    expect(BREAKPOINTS).toEqual([...new Set(BREAKPOINTS)].toSorted((a, b) => a - b))
  })
})

describe('DOCKED_FILTERS_MEDIA_CLASS', () => {
  it('hides the docked Filters exactly where the layout stops docking them', () => {
    expect(DOCKED_FILTERS_MEDIA_CLASS).toBe(`max-[${FILTERS_DOCK_WIDTH}px]:hidden`)
  })
})
