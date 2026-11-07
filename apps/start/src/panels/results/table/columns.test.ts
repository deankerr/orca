import { describe, expect, it } from 'vitest'

import {
  MIN_VISIBLE_FIGURES_WIDTH,
  MODEL_COLUMN_WIDTH,
  MODEL_COLUMN_WIDTH_CSS,
  PROVIDER_COLUMN_WIDTH,
  UNFOLD_CONTAINER_WIDTH,
} from '#app/panel-layout'

import {
  columns,
  columnWidthStyle,
  FOLDED_CLASS,
  FOLDED_LINE_FLEX_CLASS,
  FOLDED_ONLY_CLASS,
} from './columns'

describe('columns', () => {
  it('gives Provider its width, and follows it with the price columns, which make up the drawer’s clear band', () => {
    expect(columns.map((column) => column.id).slice(0, 5)).toEqual([
      'model',
      'provider',
      'input',
      'output',
      'cacheRead',
    ])
    expect(columns[1]?.meta?.width).toBe(PROVIDER_COLUMN_WIDTH)
    expect(columns.slice(2, 5).reduce((sum, column) => sum + (column.meta?.width ?? 0), 0)).toBe(
      MIN_VISIBLE_FIGURES_WIDTH,
    )
  })

  it('keeps the folded Table’s minimum width the Model column plus the figures', () => {
    const figures = columns
      .filter((column) => column.id !== 'model' && column.id !== 'provider')
      .reduce((sum, column) => sum + (column.meta?.width ?? 0), 0)

    // `TABLE_MIN_WIDTH_CLASS`, `min-w-144`.
    expect(MODEL_COLUMN_WIDTH + figures).toBe(576)
  })
})

describe('columnWidthStyle', () => {
  it('sizes Model by the Results container, and every other column by its own width', () => {
    expect(columnWidthStyle('model', undefined)).toEqual({ width: MODEL_COLUMN_WIDTH_CSS })
    expect(columnWidthStyle('context', 68)).toEqual({ width: '68px' })
  })
})

describe('the fold’s container queries', () => {
  it('hides at exactly the unfold width, and shows its stand-ins only below it', () => {
    expect(FOLDED_CLASS).toBe(`@max-[${UNFOLD_CONTAINER_WIDTH}px]/results:hidden`)
    expect(FOLDED_ONLY_CLASS).toBe(`inline-flex @min-[${UNFOLD_CONTAINER_WIDTH}px]/results:hidden`)
    expect(FOLDED_LINE_FLEX_CLASS).toBe(`flex @min-[${UNFOLD_CONTAINER_WIDTH}px]/results:hidden`)
  })
})
