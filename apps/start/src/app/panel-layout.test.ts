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
  MODEL_COLUMN_MAX_WIDTH,
  MODEL_COLUMN_WIDTH,
  MODEL_COLUMN_WIDTH_CSS,
  modelColumnWidth,
  PANEL_GAP,
  panelLayout,
  PROVIDER_COLUMN_WIDTH,
  RESULTS_BORDER_WIDTH,
  RESULTS_MIN_WIDTH,
  resultsWidth,
  tableFolds,
  tableTrailingInset,
  UNFOLD_CONTAINER_WIDTH,
  UNFOLD_RESULTS_WIDTH,
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
      ENDPOINT_WIDTH + RESULTS_BORDER_WIDTH + MODEL_COLUMN_WIDTH + MIN_VISIBLE_FIGURES_WIDTH,
    )
    expect(ENDPOINT_SIDE_WIDTH).toBe(PAD + ENDPOINT_RESULTS_WIDTH)
    expect(ENDPOINT_SIDE_DOCKED_WIDTH).toBe(
      PAD + FILTERS_WIDTH + PANEL_GAP + ENDPOINT_RESULTS_WIDTH,
    )
  })

  it('floats the drawer beside the Table exactly where a framed Results fits it', () => {
    for (let width = 0; width <= 3000; width += 1) {
      for (const collapsed of [false, true]) {
        const layout = panelLayout(width, collapsed)

        const fits =
          layout.filters !== 'drawer' &&
          resultsWidth(width, layout.filters) >= ENDPOINT_RESULTS_WIDTH

        expect(layout.endpoint).toBe(fits ? 'right' : 'bottom')
      }
    }
  })

  it('leaves the columns before the figures, and the clear band, visible wherever the drawer floats beside the Table', () => {
    for (let width = 0; width <= 3000; width += 1) {
      for (const collapsed of [false, true]) {
        const layout = panelLayout(width, collapsed)

        if (layout.endpoint === 'right') {
          const results = resultsWidth(width, layout.filters)

          const leading =
            modelColumnWidth(results) + (tableFolds(results) ? 0 : PROVIDER_COLUMN_WIDTH)

          // The band is what the leading border, the columns before the figures, and the drawer leave of Results.
          const band = results - ENDPOINT_WIDTH - RESULTS_BORDER_WIDTH - leading

          expect(band).toBeGreaterThanOrEqual(MIN_VISIBLE_FIGURES_WIDTH)
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

describe('the Table’s fold', () => {
  it('unfolds Provider where the clear band still fits after it', () => {
    expect(UNFOLD_RESULTS_WIDTH).toBe(ENDPOINT_RESULTS_WIDTH + PROVIDER_COLUMN_WIDTH)
    expect(UNFOLD_CONTAINER_WIDTH).toBe(UNFOLD_RESULTS_WIDTH - 2 * RESULTS_BORDER_WIDTH)
    expect(tableFolds(UNFOLD_RESULTS_WIDTH - 1)).toBe(true)
    expect(tableFolds(UNFOLD_RESULTS_WIDTH)).toBe(false)
  })

  it('folds once as Results widens, whatever the Filters do', () => {
    for (const collapsed of [false, true]) {
      const flips = []

      for (let width = 1; width <= 3000; width += 1) {
        const { filters } = panelLayout(width, collapsed)
        const previous = panelLayout(width - 1, collapsed).filters

        if (
          tableFolds(resultsWidth(width, filters)) !== tableFolds(resultsWidth(width - 1, previous))
        ) {
          flips.push(resultsWidth(width, filters))
        }
      }

      // Docking Filters at 776 narrows Results, but from 776 to 480: both fold.
      expect(flips).toEqual([UNFOLD_RESULTS_WIDTH])
    }
  })

  it('floats the drawer beside the Table across the fold, with no gap between', () => {
    expect(UNFOLD_RESULTS_WIDTH).toBeGreaterThan(ENDPOINT_RESULTS_WIDTH)
  })
})

describe('modelColumnWidth', () => {
  it('holds the Model column at its narrowest wherever the Table folds, and grows it without a jump', () => {
    expect(modelColumnWidth(ENDPOINT_RESULTS_WIDTH)).toBe(MODEL_COLUMN_WIDTH)
    expect(modelColumnWidth(UNFOLD_RESULTS_WIDTH - 1)).toBe(MODEL_COLUMN_WIDTH)
    expect(modelColumnWidth(UNFOLD_RESULTS_WIDTH)).toBe(MODEL_COLUMN_WIDTH)
    expect(modelColumnWidth(UNFOLD_RESULTS_WIDTH + 10)).toBe(MODEL_COLUMN_WIDTH + 10)
    expect(modelColumnWidth(2560)).toBe(MODEL_COLUMN_MAX_WIDTH)
  })

  it('is the CSS clamp the `<col>` uses', () => {
    expect(MODEL_COLUMN_WIDTH_CSS).toBe(
      `clamp(${MODEL_COLUMN_WIDTH}px, 100cqw - ${UNFOLD_CONTAINER_WIDTH - MODEL_COLUMN_WIDTH}px, ${MODEL_COLUMN_MAX_WIDTH}px)`,
    )
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
