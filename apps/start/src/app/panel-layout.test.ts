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
  closedSession,
  sheetSessionIn,
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
      [768, layout('sheet', 'sheet')],
      [800, layout('docked', 'sheet')],
      [1024, layout('sheet', 'docked')],
      [1440, layout('docked', 'docked')],
    ] as const)('lays out a %ipx page as %o', (width, expected) => {
      expect(panelLayout(width, true)).toEqual(expected)
    })

    it('docks the Endpoint panel before Filters', () => {
      const endpointDocks = PAD + RESULTS_MIN_WIDTH + PANEL_GAP + ENDPOINT_WIDTH

      expect(panelLayout(endpointDocks, true)).toEqual(layout('sheet', 'docked'))
      expect(panelLayout(endpointDocks + PANEL_GAP + FILTERS_WIDTH, true)).toEqual(
        layout('docked', 'docked'),
      )
    })

    it('opens the Endpoint panel in a sheet, never over Results, when it does not dock', () => {
      const endpointDocks = PAD + RESULTS_MIN_WIDTH + PANEL_GAP + ENDPOINT_WIDTH

      for (let width = 0; width < endpointDocks; width += 1) {
        expect(panelLayout(width, true).endpoint).toBe('sheet')
      }
    })

    it('keeps Filters docked beside Results while the Endpoint panel is in a sheet', () => {
      const filtersDock = PAD + RESULTS_MIN_WIDTH + PANEL_GAP + FILTERS_WIDTH

      expect(panelLayout(filtersDock, true)).toEqual(layout('docked', 'sheet'))
      expect(panelLayout(filtersDock - 1, true)).toEqual(layout('sheet', 'sheet'))
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

describe('sheetSessionIn', () => {
  const opened = { open: true, placement: 'sheet' } as const

  it('keeps a session open while the Panel stays in its sheet', () => {
    expect(sheetSessionIn(opened, 'sheet')).toBe(opened)
  })

  it('ends the session when the Panel leaves its sheet', () => {
    expect(sheetSessionIn(opened, 'docked')).toEqual(closedSession('docked'))
  })

  it('finds the sheet closed when the Panel returns to it', () => {
    // Open Filters on a phone, widen the window until they dock, then narrow it again.
    const docked = sheetSessionIn(opened, 'docked')

    expect(sheetSessionIn(docked, 'sheet').open).toBe(false)
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
