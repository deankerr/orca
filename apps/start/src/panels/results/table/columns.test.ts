import { describe, expect, it } from 'vitest'

import {
  FIGURE_COLUMN_COUNT,
  MODEL_COLUMN_WIDTH_CSS,
  PROVIDER_COLUMN_WIDTH,
  TABLE_MIN_WIDTH,
  UNFOLD_CONTAINER_WIDTH,
} from '#app/panel-layout'

import {
  columnLabel,
  columns,
  columnWidthStyle,
  FOLDED_CLASS,
  FOLDED_LINE_FLEX_CLASS,
  FOLDED_ONLY_CLASS,
  TABLE_MIN_WIDTH_CLASS,
} from './columns'
import { STICKY_MODEL_CLASS } from './endpoint-table'

describe('columns', () => {
  it('orders the columns Model, Provider, then the figures, Cost first', () => {
    expect(columns.map((column) => column.id)).toEqual([
      'model',
      'provider',
      'cost',
      'input',
      'output',
      'cacheRead',
      'throughput',
      'latency',
      'context',
      'released',
    ])
  })

  it('has the figure columns the width rule shares the surplus between', () => {
    expect(columns.filter((column) => column.meta?.numeric === true)).toHaveLength(
      FIGURE_COLUMN_COUNT,
    )
    expect(FIGURE_COLUMN_COUNT).toBe(8)
  })

  it('makes Cost numeric, sortable, and ascending first, the first figure after Provider', () => {
    const ids = columns.map((column) => column.id)
    const cost = columns.find((column) => column.id === 'cost')

    expect(ids.indexOf('cost')).toBe(ids.indexOf('provider') + 1)
    expect(columnLabel('cost')).toBe('Cost')
    expect(cost?.meta?.numeric).toBe(true)
    expect(cost?.sortDescFirst).toBe(false)
  })

  it('makes Released the last column, numeric, and newest first', () => {
    const released = columns.at(-1)

    expect(released?.id).toBe('released')
    expect(columnLabel('released')).toBe('Released')
    expect(released?.meta?.numeric).toBe(true)
    expect(released?.sortDescFirst).toBe(true)
  })

  it('names every column by a label, which the loading skeleton reads', () => {
    for (const column of columns) {
      expect(columnLabel(column.id)).toBeTypeOf('string')
    }
  })
})

describe('columnWidthStyle', () => {
  it('sizes Model by the Results container and Provider by its own width, and leaves the figures to share the rest', () => {
    expect(columnWidthStyle('model')).toEqual({ width: MODEL_COLUMN_WIDTH_CSS })
    expect(columnWidthStyle('provider')).toEqual({ width: `${PROVIDER_COLUMN_WIDTH}px` })

    for (const column of columns.filter((candidate) => candidate.meta?.numeric === true)) {
      expect(columnWidthStyle(column.id)).toEqual({})
    }
  })
})

describe('the Table’s container queries', () => {
  it('hides at exactly the unfold width, and shows its stand-ins only below it', () => {
    expect(FOLDED_CLASS).toBe(`@max-[${UNFOLD_CONTAINER_WIDTH}px]/results:hidden`)
    expect(FOLDED_ONLY_CLASS).toBe(`inline-flex @min-[${UNFOLD_CONTAINER_WIDTH}px]/results:hidden`)
    expect(FOLDED_LINE_FLEX_CLASS).toBe(`flex @min-[${UNFOLD_CONTAINER_WIDTH}px]/results:hidden`)
  })

  it('scrolls the Table sideways, with a rule after Model, below its minimum width', () => {
    expect(TABLE_MIN_WIDTH_CLASS).toBe(`min-w-[${TABLE_MIN_WIDTH}px]`)
    expect(STICKY_MODEL_CLASS).toContain(
      `@max-[${TABLE_MIN_WIDTH}px]/results:pointer-fine:first:border-r`,
    )
  })
})
