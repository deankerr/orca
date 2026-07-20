import { describe, expect, test } from 'bun:test'

import { buildColumnHoverStyles, buildParameterMatrix } from './parameter-comparison-matrix'

describe('buildParameterMatrix', () => {
  test('counts each parameter at most once per provider', () => {
    const matrix = buildParameterMatrix([
      {
        provider: { name: 'Beta' },
        supported_parameters: ['tools', 'tools', 'seed'],
      },
      {
        provider: { name: 'Alpha' },
        supported_parameters: ['tools'],
      },
    ])

    expect(matrix.columns).toEqual([
      { parameter: 'tools', supportCount: 2 },
      { parameter: 'seed', supportCount: 1 },
    ])
  })

  test('sorts available providers first and then by name', () => {
    const matrix = buildParameterMatrix([
      {
        provider: { name: 'Unavailable' },
        supported_parameters: ['tools'],
        unavailable_at: '2026-01-01',
      },
      {
        provider: { name: 'Zulu' },
        supported_parameters: ['tools'],
      },
      {
        provider: { name: 'Alpha' },
        supported_parameters: ['tools'],
      },
    ])

    expect(matrix.rows.map(({ endpoint }) => endpoint.provider.name)).toEqual([
      'Alpha',
      'Zulu',
      'Unavailable',
    ])
  })
})

describe('buildColumnHoverStyles', () => {
  test('offsets parameter selectors by the leading provider column', () => {
    const styles = buildColumnHoverStyles(2)

    expect(styles).toContain('td:nth-child(2):hover')
    expect(styles).toContain('th:nth-child(2)')
    expect(styles).toContain('> tbody > tr > td:nth-child(2) {')
    expect(styles).toContain('td:nth-child(3):hover')
    expect(styles).toContain('th:nth-child(3)')
    expect(styles).toContain('> tbody > tr > td:nth-child(3) {')
    expect(styles).not.toContain('nth-child(1)')
    expect(styles).not.toContain('nth-child(4)')
  })

  test('emits no rules for an empty matrix', () => {
    expect(buildColumnHoverStyles(0)).toBe('')
  })
})
