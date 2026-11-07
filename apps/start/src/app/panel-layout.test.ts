import { describe, expect, it } from 'vitest'

import {
  BREAKPOINTS,
  breakpointFloor,
  closedSession,
  DOCKED_FILTERS_MEDIA_CLASS,
  drawerSessionIn,
  ENDPOINT_RESULTS_WIDTH,
  ENDPOINT_SIDE_DOCKED_WIDTH,
  ENDPOINT_SIDE_WIDTH,
  ENDPOINT_WIDTH,
  FILTERS_DOCK_WIDTH,
  FILTERS_WIDTH,
  FLUSH_BOTTOM_MEDIA_CLASS,
  FLUSH_FRAME_MEDIA_CLASS,
  FLUSH_PAGE_MEDIA_CLASS,
  FLUSH_TOP_MEDIA_CLASS,
  MIN_VISIBLE_FIGURES_WIDTH,
  MODEL_COLUMN_WIDTH,
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
    [390, false, 'bottom'],
    [768, false, 'bottom'],
    [888, false, 'bottom'],
    [888, true, 'right'],
    [ENDPOINT_SIDE_WIDTH - 1, true, 'bottom'],
    [ENDPOINT_SIDE_WIDTH, true, 'right'],
    [ENDPOINT_SIDE_DOCKED_WIDTH - 1, false, 'bottom'],
    [ENDPOINT_SIDE_DOCKED_WIDTH, false, 'right'],
    [1024, false, 'bottom'],
    [1024, true, 'right'],
    [1280, false, 'right'],
    [1728, false, 'right'],
  ] as const)(
    'floats the Endpoint drawer on a %ipx page (Filters collapsed: %s) from the %s',
    (width, collapsed, side) => {
      expect(panelLayout(width, collapsed).endpoint).toBe(side)
    },
  )

  it('keeps the Model column and a readable band of figures beside the Endpoint drawer', () => {
    // The drawer covers its width of Results; docked Filters take a column and a gap from it.
    expect(ENDPOINT_RESULTS_WIDTH).toBe(
      ENDPOINT_WIDTH + MODEL_COLUMN_WIDTH + MIN_VISIBLE_FIGURES_WIDTH,
    )
    expect(ENDPOINT_SIDE_WIDTH).toBe(PAD + ENDPOINT_RESULTS_WIDTH)
    expect(ENDPOINT_SIDE_DOCKED_WIDTH).toBe(
      PAD + FILTERS_WIDTH + PANEL_GAP + ENDPOINT_RESULTS_WIDTH,
    )
  })

  it('leaves the Model column and the figures visible wherever the drawer floats beside the Table', () => {
    for (let width = 0; width <= 2000; width += 1) {
      for (const collapsed of [false, true]) {
        const layout = panelLayout(width, collapsed)

        if (layout.endpoint === 'right') {
          const dockedColumn = layout.filters === 'docked' ? FILTERS_WIDTH + PANEL_GAP : 0
          const results = width - PAD - dockedColumn

          expect(results - ENDPOINT_WIDTH).toBeGreaterThanOrEqual(
            MODEL_COLUMN_WIDTH + MIN_VISIBLE_FIGURES_WIDTH,
          )
        }
      }
    }
  })

  it('never moves Filters for the Endpoint drawer', () => {
    for (let width = 0; width <= 2000; width += 1) {
      expect(panelLayout(width, false).filters).toBe(
        width < FILTERS_DOCK_WIDTH ? 'drawer' : 'docked',
      )
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
    expect(tableTrailingInset(panelLayout(1024, false), true)).toBe(0)
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
