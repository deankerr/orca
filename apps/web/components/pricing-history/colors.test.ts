import { describe, expect, test } from 'bun:test'

import { providerColor, providerSrgbColor } from './colors'

const KNOWN_PROVIDERS = [
  'anthropic',
  'openai',
  'google-vertex',
  'google-ai-studio',
  'amazon-bedrock',
  'azure',
  'deepinfra',
  'together',
  'fireworks',
  'groq',
  'mistral',
  'novita',
  'nebius',
  'hyperbolic',
  'cerebras',
  'sambanova',
]

describe('providerColor', () => {
  test('is a pure function of the provider id', () => {
    expect(providerColor('anthropic')).toBe(providerColor('anthropic'))
    expect(providerColor('anthropic')).not.toBe(providerColor('openai'))
  })

  test('emits valid in-range oklch coordinates', () => {
    for (const providerId of KNOWN_PROVIDERS) {
      const color = providerColor(providerId)
      expect(color).toMatch(/^oklch\(0\.\d+ 0\.\d+ \d+(?:\.\d+)?\)$/)

      const [lightness, chroma, hue] = color.slice('oklch('.length, -1).split(' ').map(Number)
      expect(lightness).toBeWithin(0.66, 0.7601)
      expect(chroma).toBeGreaterThan(0)
      expect(hue).toBeWithin(0, 360)
    }
  })

  test('never lands in the murky olive hue band', () => {
    // Sweep a large id space; every hash must map outside the excluded hues.
    for (let index = 0; index < 2000; index += 1) {
      const color = providerColor(`provider-${index}`)
      const hue = Number(color.slice(color.lastIndexOf(' ') + 1, -1))

      expect(hue < 100 || hue >= 120).toBe(true)
    }
  })

  test('keeps the current provider roster free of exact collisions', () => {
    const colors = KNOWN_PROVIDERS.map(providerColor)

    expect(new Set(colors).size).toBe(KNOWN_PROVIDERS.length)
  })

  test('provides the same palette in the sRGB syntax required by ECharts', () => {
    for (const providerId of KNOWN_PROVIDERS) {
      expect(providerSrgbColor(providerId)).toMatch(/^rgb\(\d+, \d+, \d+\)$/)
    }

    expect(providerSrgbColor('anthropic')).toBe(providerSrgbColor('anthropic'))
  })
})
