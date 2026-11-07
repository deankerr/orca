import { describe, expect, it } from 'vitest'

import {
  foldsForEndpoint,
  foldWidth,
  MIN_VISIBLE_FIGURES_WIDTH,
  MODEL_COLUMN_WIDTH,
  panelLayout,
} from '#app/panel-layout'

import { columns, columnWidths, columnWidthStyle, FOLD_CLASSES, skeletonFold } from './columns'

const widthOf = (id: string, placementFold: boolean) => {
  const column = columns.find((candidate) => candidate.id === id)
  const widths = columnWidths(id, column?.meta?.width)

  return placementFold ? widths.folded : widths.unfolded
}

describe('columnWidths', () => {
  it('lets Model take the surplus, and keeps every other column its width, when Provider has its column', () => {
    expect(widthOf('model', false)).toBeUndefined()
    expect(widthOf('provider', false)).toBe(184)
    expect(widthOf('context', false)).toBe(68)
  })

  it('holds Model and lets the last column take the surplus where Provider folds for the drawer', () => {
    expect(widthOf('model', true)).toBe(MODEL_COLUMN_WIDTH)
    expect(widthOf('context', true)).toBeUndefined()
    expect(widthOf('input', true)).toBe(68)
  })

  it('follows Model with the price columns, which make up the drawer’s clear band', () => {
    const priced = ['input', 'output', 'cacheRead'].map((id) => widthOf(id, true))

    expect(priced.reduce<number>((sum, width) => sum + (width ?? 0), 0)).toBe(
      MIN_VISIBLE_FIGURES_WIDTH,
    )
    expect(columns.map((column) => column.id).slice(2, 5)).toEqual(['input', 'output', 'cacheRead'])
  })

  it('keeps the folded Table’s minimum width the Model column plus the figures', () => {
    const figures = columns
      .filter((column) => column.id !== 'model' && column.id !== 'provider')
      .reduce((sum, column) => sum + (column.meta?.width ?? 0), 0)

    // `min-w-144` in TABLE_WRAPPER_CLASS.
    expect(MODEL_COLUMN_WIDTH + figures).toBe(576)
  })
})

describe('columnWidthStyle', () => {
  it('names a column’s widths for the fold to choose between', () => {
    expect(columnWidthStyle('model', undefined)).toEqual({
      '--col-folded-width': `${MODEL_COLUMN_WIDTH}px`,
      '--col-width': 'auto',
    })
    expect(columnWidthStyle('context', 68)).toEqual({
      '--col-folded-width': 'auto',
      '--col-width': '68px',
    })
  })
})

describe('the loading skeleton’s fold', () => {
  const minWidthOf = (classes: string) =>
    [...classes.matchAll(/min-\[(?<width>\d+)px\]:/gu)].map((match) => Number(match.groups?.width))

  it.each([
    ['docked', false],
    ['collapsed', true],
  ] as const)('folds %s Filters from exactly the width the layout does', (trigger, collapsed) => {
    expect(skeletonFold(collapsed)).toBe(trigger)

    for (const classes of Object.values(FOLD_CLASSES[trigger])) {
      expect(new Set(minWidthOf(classes))).toEqual(new Set([foldWidth(collapsed)]))
    }
  })

  it('agrees with the layout at every width, whichever way Filters are left', () => {
    for (let width = 0; width <= 2000; width += 1) {
      for (const collapsed of [false, true]) {
        expect(width >= foldWidth(collapsed)).toBe(foldsForEndpoint(panelLayout(width, collapsed)))
      }
    }
  })

  it('leaves the loaded Table to its attribute, with no page width', () => {
    for (const classes of Object.values(FOLD_CLASSES.data)) {
      expect(minWidthOf(classes)).toEqual([])
    }
  })
})
