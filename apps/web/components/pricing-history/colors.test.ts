import { describe, expect, test } from 'bun:test'

import { endpointColor, endpointSrgbColor } from './colors'

describe('endpointColor', () => {
  test('uses a vivid curated palette for the common endpoint counts', () => {
    const colors = Array.from({ length: 10 }, (_, index) => endpointColor(index, 10))

    expect(colors.map((color) => color.slice(color.lastIndexOf(' ') + 1, -1))).toEqual([
      '250',
      '25',
      '145',
      '305',
      '85',
      '195',
      '350',
      '115',
      '275',
      '55',
    ])
  })

  test('generates a unique in-gamut palette for long-tail endpoint counts', () => {
    const colors = Array.from({ length: 32 }, (_, index) => endpointColor(index, 32))

    expect(new Set(colors).size).toBe(32)
    expect(colors.every((color) => /^oklch\(0\.7 0\.\d+ \d+(?:\.\d+)?\)$/.test(color))).toBe(true)
  })

  test('keeps the first colors stable as common endpoint counts grow', () => {
    expect(endpointColor(0, 2)).toBe(endpointColor(0, 10))
    expect(endpointColor(1, 2)).toBe(endpointColor(1, 10))
  })

  test('provides the same palette in the sRGB syntax required by ECharts', () => {
    const colors = Array.from({ length: 32 }, (_, index) => endpointSrgbColor(index, 32))

    expect(new Set(colors).size).toBe(32)
    expect(colors.every((color) => /^rgb\(\d+, \d+, \d+\)$/.test(color))).toBe(true)
  })
})
