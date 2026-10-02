import { expect, test } from 'bun:test'

import { compare } from '../events/compare'
import type { EventRow } from '../events/query'
import { curate } from './curate'
import { forMonitor } from './pipelines'

function update(kind: 'provider' | 'endpoint', before: unknown, after: unknown): EventRow {
  const [change] = compare({ entity: before }, { entity: after })

  const identity = {
    entity_id: 'entity',
    type: 'UPDATE' as const,
    scan_at: '2026-10-01T00:00:00.000Z',
    change_json: JSON.stringify(change),
  }

  const provider = { provider_id: 'provider', display_name: 'Provider' }

  return kind === 'provider'
    ? { ...identity, entity_kind: kind, context: { provider } }
    : {
        ...identity,
        entity_kind: kind,
        context: {
          provider,
          model: { model_id: 'model', display_name: 'Model' },
          endpoint: {
            endpoint_id: 'entity',
            provider_tag: 'tag',
            provider_display_name: 'Offering',
          },
        },
      }
}

test('shared selection retains Discord field policy without rewriting captured or generally curated facts', () => {
  const provider = update(
    'provider',
    { metadata: {} },
    {
      metadata: {
        dataPolicy: { training: false, privacyPolicyURL: 'https://example.com/privacy' },
      },
    },
  )

  expect(forMonitor(provider)).toMatchObject({
    changes: [
      {
        type: 'field_added',
        path: 'dataPolicy.privacyPolicyURL',
        after: 'https://example.com/privacy',
      },
    ],
  })

  expect(curate(provider)).toMatchObject({
    changes: [
      {
        path: 'dataPolicy',
        after: { training: false, privacyPolicyURL: 'https://example.com/privacy' },
      },
    ],
  })

  expect(
    forMonitor(
      update(
        'provider',
        { metadata: { dataPolicy: { training: true } } },
        { metadata: { dataPolicy: { training: false } } },
      ),
    ),
  ).toBeNull()

  expect(
    forMonitor(
      update(
        'endpoint',
        { metadata: { supports_reasoning: false } },
        { metadata: { supports_reasoning: true } },
      ),
    ),
  ).toBeNull()

  expect(
    forMonitor(
      update(
        'endpoint',
        { metadata: { supports_reasoning: false, context_length: 100 } },
        { metadata: { supports_reasoning: true, context_length: 200 } },
      ),
    ),
  ).toMatchObject({ changes: [{ path: 'context_length', before: 100, after: 200 }] })
})
