import { describe, expect, test } from 'bun:test'

import { analyzeBundle } from './analyze-bundle.ts'
import {
  bundle,
  displayRow,
  endpoint,
  endpointId,
  otherEndpointId,
  pricing,
  source,
} from './test-fixtures.ts'

describe('analyzeBundle', () => {
  test('classifies schedule evidence without calculating an active band', () => {
    const scheduleRow = displayRow({
      kind: 'schedule',
      scheduleWindows: [{ utc_end: 400, utc_start: 1400 }],
    })
    const input = bundle('schedule', '2026-08-24T00:00:00.000Z', [
      endpoint({
        display_pricing: [scheduleRow],
        pricing: pricing({
          display_pricing: [scheduleRow],
          overrides: [
            { completion: '0.000004', min_prompt_tokens: 200_000, prompt: '0.000003' },
            { completion: '0.000001', prompt: '0.000001', utc_end: 400, utc_start: 1400 },
          ],
        }),
      }),
    ])

    const analyzed = analyzeBundle(source(input))

    expect(analyzed.pricing_states[0]?.classification).toEqual({
      display_pricing_kinds: ['schedule'],
      override_conditions: ['prompt_length', 'time_window'],
      pricing_display_kinds: ['schedule'],
    })
  })

  test('verifies every endpoint before producing states', () => {
    const input = bundle('invalid', '2026-08-24T00:00:00.000Z', [
      endpoint(),
      endpoint({ id: otherEndpointId, pricing: pricing({ prompt: '1e-6' }) }),
    ])

    expect(() => analyzeBundle(source(input))).toThrow('must be a direct decimal string')
  })

  test('rejects duplicate endpoint identities', () => {
    const input = bundle('duplicate', '2026-08-24T00:00:00.000Z', [endpoint(), endpoint()])

    expect(() => analyzeBundle(source(input))).toThrow(`Duplicate endpoint id ${endpointId}`)
  })

  test('verifies complete model and provider structures', () => {
    const invalidModel = bundle('model', '2026-08-24T00:00:00.000Z', [endpoint()])
    const [modelEntry] = invalidModel.data
    if (modelEntry === undefined) {
      throw new Error('Missing model fixture.')
    }
    modelEntry.model.author = 42

    expect(() => analyzeBundle(source(invalidModel))).toThrow('Invalid model example/model')

    const invalidProvider = bundle('provider', '2026-08-24T00:00:00.000Z', [
      endpoint({ provider_info: {} }),
    ])
    expect(() => analyzeBundle(source(invalidProvider))).toThrow('provider_info')
  })

  test('keeps categorical strings open while rejecting unknown display pricing kinds', () => {
    const openCategories = bundle('open', '2026-08-24T00:00:00.000Z', [
      endpoint({
        deprecation_date: '2026-09-01',
        supported_image_parameters: { aspect_ratios: null },
      }),
    ])
    expect(() => analyzeBundle(source(openCategories))).not.toThrow()

    const invalidDisplayKind = bundle('kind', '2026-08-24T00:00:00.000Z', [
      endpoint({ display_pricing: [displayRow({ kind: 'future-kind' })] }),
    ])
    expect(() => analyzeBundle(source(invalidDisplayKind))).toThrow(
      "Expected 'schedule' | 'token' | 'unit'",
    )
  })
})
