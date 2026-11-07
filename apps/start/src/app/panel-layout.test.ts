import { describe, expect, it } from 'vitest'

import {
  BREAKPOINTS,
  breakpointFloor,
  closedSession,
  DOCKED_FILTERS_MEDIA_CLASS,
  drawerSessionIn,
  ENDPOINT_SIDE_WIDTH,
  ENDPOINT_WIDTH,
  FILTERS_DOCK_WIDTH,
  FILTERS_WIDTH,
  FLUSH_BOTTOM_MEDIA_CLASS,
  FLUSH_FRAME_MEDIA_CLASS,
  FLUSH_PAGE_MEDIA_CLASS,
  FLUSH_TOP_MEDIA_CLASS,
  PANEL_GAP,
  panelLayout,
  RESULTS_MIN_WIDTH,
  tableTrailingInset,
} from './panel-layout'

const PAD = 2 * PANEL_GAP

describe('panelLayout', () => {
  it.each([
    [390, 'drawer'],
    [768, 'drawer'],
    [FILTERS_DOCK_WIDTH - 1, 'drawer'],
    [FILTERS_DOCK_WIDTH, 'docked'],
    [1024, 'docked'],
    [1440, 'docked'],
  ] as const)('puts expanded Filters on a %ipx page in a %s', (width, filters) => {
    expect(panelLayout(width, false).filters).toBe(filters)
  })

  it('docks Filters where they leave Results its minimum width', () => {
    expect(FILTERS_DOCK_WIDTH).toBe(PAD + FILTERS_WIDTH + PANEL_GAP + RESULTS_MIN_WIDTH)
  })

  it('collapses docked Filters when the user has, and keeps a narrow page’s in a drawer', () => {
    expect(panelLayout(1440, true).filters).toBe('collapsed')
    expect(panelLayout(FILTERS_DOCK_WIDTH, true).filters).toBe('collapsed')
    expect(panelLayout(FILTERS_DOCK_WIDTH - 1, true).filters).toBe('drawer')
  })

  it.each([
    [390, 'bottom'],
    [768, 'bottom'],
    [ENDPOINT_SIDE_WIDTH - 1, 'bottom'],
    [ENDPOINT_SIDE_WIDTH, 'right'],
    [1024, 'right'],
    [1728, 'right'],
  ] as const)('floats the Endpoint drawer on a %ipx page from the %s', (width, side) => {
    expect(panelLayout(width, false).endpoint).toBe(side)
  })

  it('floats the Endpoint drawer beside the Table where Results keeps its minimum width beside it', () => {
    expect(ENDPOINT_SIDE_WIDTH).toBe(PAD + RESULTS_MIN_WIDTH + PANEL_GAP + ENDPOINT_WIDTH)
  })

  it('never moves Filters for the Endpoint drawer, or the drawer for Filters', () => {
    for (let width = 0; width <= 2000; width += 1) {
      expect(panelLayout(width, true).endpoint).toBe(panelLayout(width, false).endpoint)
    }
  })
})

describe('tableTrailingInset', () => {
  it('leaves the Table room for an Endpoint drawer beside it', () => {
    expect(tableTrailingInset(panelLayout(1440, false), true)).toBe(ENDPOINT_WIDTH + PANEL_GAP)
  })

  it('leaves none with nothing selected, or for a drawer from the bottom', () => {
    expect(tableTrailingInset(panelLayout(1440, false), false)).toBe(0)
    expect(tableTrailingInset(panelLayout(390, false), true)).toBe(0)
  })
})

describe('drawerSessionIn', () => {
  const opened = { open: true, placement: 'drawer' } as const

  it('keeps a session open while the Panel stays in its drawer', () => {
    expect(drawerSessionIn(opened, 'drawer')).toBe(opened)
  })

  it('ends the session when the Panel leaves its drawer', () => {
    expect(drawerSessionIn(opened, 'docked')).toEqual(closedSession('docked'))
  })

  it('finds the drawer closed when the Panel returns to it', () => {
    // Open Filters on a phone, widen the window until they dock, then narrow it again.
    const docked = drawerSessionIn(opened, 'docked')

    expect(drawerSessionIn(docked, 'drawer').open).toBe(false)
  })
})

describe('breakpointFloor', () => {
  it('keeps the layout of every width it floors', () => {
    for (let width = 0; width <= 2000; width += 1) {
      for (const collapsed of [false, true]) {
        expect(panelLayout(breakpointFloor(width), collapsed)).toEqual(
          panelLayout(width, collapsed),
        )
      }
    }
  })

  it('lists each breakpoint once, ascending', () => {
    expect(BREAKPOINTS).toEqual([...new Set(BREAKPOINTS)].toSorted((a, b) => a - b))
  })
})

describe('media classes', () => {
  const variant = `max-[${FILTERS_DOCK_WIDTH}px]:`

  it('hides the docked Filters exactly where the layout puts them in a drawer', () => {
    expect(DOCKED_FILTERS_MEDIA_CLASS).toBe(`${variant}hidden`)
  })

  it.each([
    ['page', FLUSH_PAGE_MEDIA_CLASS],
    ['frame', FLUSH_FRAME_MEDIA_CLASS],
    ['top', FLUSH_TOP_MEDIA_CLASS],
    ['bottom', FLUSH_BOTTOM_MEDIA_CLASS],
  ])('runs Results flush (%s) exactly where it is the only docked Panel', (_, classes) => {
    for (const name of classes.split(' ')) {
      expect(name.startsWith(variant)).toBe(true)
    }
  })
})
