import { describe, expect, it } from 'vitest'

import { MIN_VISIBLE_FIGURES_WIDTH, MODEL_COLUMN_WIDTH } from '#app/panel-layout'

import { columns, columnWidth } from './columns'

const widthOf = (id: string, placementFold: boolean) => {
  const column = columns.find((candidate) => candidate.id === id)

  return columnWidth(id, column?.meta?.width, placementFold)
}

describe('columnWidth', () => {
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
