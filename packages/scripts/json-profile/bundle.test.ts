// oxlint-disable sort-keys -- Expected objects mirror the serialized JSON profile format.

import { describe, expect, test } from 'bun:test'

import type { ModelEndpointsV1 } from '../model-endpoints-v1.ts'
import { ModelEndpointsV1Schema } from '../model-endpoints-v1.ts'
import { bundleProfileFilename, profileBundle } from './bundle.ts'

describe('profileBundle', () => {
  test('profiles every model and endpoint record', () => {
    const report = profileBundle(
      bundle([
        {
          endpoints: [{ id: 'endpoint-1', provider: { name: 'A' } }],
          model: { context_length: 1000, slug: 'one' },
        },
        {
          endpoints: null,
          model: { slug: 'two' },
        },
      ]),
    )

    expect(report).toMatchObject({
      report_format: 'orca-bundle-json-profile-v1',
      selection: {},
      source: {
        crawl_id: '123',
        bundle_format: 'model-endpoints-v1',
      },
    })
    expect(Object.keys(report)).toEqual([
      'report_format',
      'source',
      'selection',
      'models',
      'endpoints',
    ])
    expect(report.models?.record_count).toBe(2)
    expect(report.endpoints?.record_count).toBe(1)
    expect(findRootField(report.models, 'context_length')).toMatchObject({
      none: 1,
      population: 2,
    })
    expect(findRootField(report.endpoints, 'provider').path).toBe('$[*]["provider"]')
    expect(bundleProfileFilename(report)).toBe(
      'json-profile.2026-08-25T00:00:00.000Z.me1.orca.json',
    )
  })

  test('filters models to those with text input and output modalities', () => {
    const report = profileBundle(
      bundle([
        {
          endpoints: [],
          model: {
            id: 'both-text',
            input_modalities: ['text'],
            output_modalities: ['text'],
          },
        },
        {
          endpoints: [],
          model: {
            id: 'text-input-only',
            input_modalities: ['text'],
            output_modalities: ['image'],
          },
        },
        {
          endpoints: [],
          model: {
            id: 'text-output-only',
            input_modalities: ['image'],
            output_modalities: ['text'],
          },
        },
        {
          endpoints: [],
          model: {
            id: 'mixed-text',
            input_modalities: ['image', 'text'],
            output_modalities: ['text', 'image'],
          },
        },
      ]),
      { modelsWithText: true },
    )

    expect(report.selection).toEqual({ models_with_text: true })
    expect(bundleProfileFilename(report)).toBe(
      'json-profile.text-only.2026-08-25T00:00:00.000Z.me1.orca.json',
    )
    expect(report.models?.record_count).toBe(2)
    expect(findRootField(report.models, 'id')).toMatchObject({ none: 0, population: 2 })
  })

  test('filters endpoints using the modalities of their associated model', () => {
    const report = profileBundle(
      bundle([
        {
          endpoints: [{ id: 'both-text-1' }, { id: 'both-text-2' }],
          model: { input_modalities: ['text'], output_modalities: ['text'] },
        },
        {
          endpoints: [{ id: 'text-input-only' }],
          model: { input_modalities: ['text'], output_modalities: ['image'] },
        },
        {
          endpoints: [{ id: 'mixed-text' }],
          model: { input_modalities: ['image', 'text'], output_modalities: ['text', 'image'] },
        },
      ]),
      { modelsWithText: true },
    )

    expect(report.models?.record_count).toBe(2)
    expect(report.endpoints?.record_count).toBe(3)
  })
})

function bundle(entries: Array<{ endpoints: unknown; model: unknown }>): ModelEndpointsV1 {
  let endpointIndex = 0
  return ModelEndpointsV1Schema.parse({
    bundle_format: 'model-endpoints-v1',
    crawl_at: '2026-08-25T00:00:00.000Z',
    crawl_id: '123',
    data: entries.map((entry, entryIndex) => ({
      endpoints: Array.isArray(entry.endpoints)
        ? entry.endpoints.map((endpoint) => {
            endpointIndex += 1
            return {
              ...(isRecord(endpoint) ? endpoint : {}),
              id: `00000000-0000-4000-8000-${String(endpointIndex).padStart(12, '0')}`,
              model_variant_slug: `model-${entryIndex}`,
            }
          })
        : entry.endpoints,
      model: isRecord(entry.model)
        ? {
            permaslug: `model-${entryIndex}`,
            slug: `model-${entryIndex}`,
            ...entry.model,
          }
        : entry.model,
      model_id: `model-${entryIndex}`,
      variant: 'standard',
    })),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function findRootField(profile: ReturnType<typeof profileBundle>['models'], name: string) {
  const rootObject = profile?.root.types.find((type) => type.type === 'object')
  if (rootObject?.type !== 'object') {
    throw new Error('Missing root object profile')
  }
  const field = rootObject.fields.find((candidate) => candidate.name === name)
  if (field === undefined) {
    throw new Error(`Missing root field: ${name}`)
  }
  return field
}
