import { describe, expect, it } from 'vitest'

import {
  FIGURE_COLUMN_COUNT,
  MODEL_COLUMN_WIDTH_CSS,
  PROVIDER_COLUMN_WIDTH,
  TABLE_MIN_WIDTH,
  UNFOLD_CONTAINER_WIDTH,
} from '#app/panel-layout'

import {
  columns,
  columnWidthStyle,
  FOLDED_CLASS,
  FOLDED_LINE_FLEX_CLASS,
  FOLDED_ONLY_CLASS,
  TABLE_MIN_WIDTH_CLASS,
} from './columns'
import { STICKY_MODEL_CLASS } from './endpoint-table'

describe('columns', () => {
  it('follows Model and Provider with Input and Output, the figures kept clear of the drawer', () => {
    expect(columns.map((column) => column.id).slice(0, 4)).toEqual([
      'model',
      'provider',
      'input',
      'output',
    ])
  })

  it('has the six figure columns the width rule shares the surplus between', () => {
    expect(columns.filter((column) => column.meta?.numeric === true)).toHaveLength(
      FIGURE_COLUMN_COUNT,
    )
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
    expect(STICKY_MODEL_CLASS).toContain(`@max-[${TABLE_MIN_WIDTH}px]/results:first:border-r`)
  })
})
