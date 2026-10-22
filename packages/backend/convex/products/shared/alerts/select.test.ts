import { expect, test } from 'vitest'

import type { EventRow } from '../../../catalog/tables/events'
import { compare } from '../../../compare'
import type { JsonValue } from '../../../json'
import { curate } from './curate'
import { prepare as prepareAlert } from './prepare'

function update(kind: 'provider' | 'endpoint', before: JsonValue, after: JsonValue): EventRow {
  const [change] = compare({ entity: before }, { entity: after })

  const identity = {
    change_json: JSON.stringify(change),
    entity_id: 'entity',
    scan_at: '2026-10-01T00:00:00.000Z',
    type: 'UPDATE' as const,
  }

  const provider = { display_name: 'Provider', provider_id: 'provider' }

  return kind === 'provider'
    ? { ...identity, context: { provider }, entity_kind: kind }
    : {
        ...identity,
        context: {
          endpoint: {
            endpoint_id: 'entity',
            provider_display_name: 'Offering',
            provider_tag: 'tag',
          },
          model: { display_name: 'Model', model_id: 'model' },
          provider,
        },
        entity_kind: kind,
      }
}

test('shared selection retains Discord field policy without rewriting captured or generally curated facts', () => {
  const provider = update(
    'provider',
    { metadata: {} },
    {
      metadata: {
        dataPolicy: { privacyPolicyURL: 'https://example.com/privacy', training: false },
      },
    },
  )

  expect(prepareAlert(provider)).toMatchObject({
    changes: [
      {
        after: 'https://example.com/privacy',
        path: 'dataPolicy.privacyPolicyURL',
        type: 'field_added',
      },
    ],
  })

  expect(curate(provider)).toMatchObject({
    changes: [
      {
        after: { privacyPolicyURL: 'https://example.com/privacy', training: false },
        path: 'dataPolicy',
      },
    ],
  })

  expect(
    prepareAlert(
      update(
        'provider',
        { metadata: { dataPolicy: { training: true } } },
        { metadata: { dataPolicy: { training: false } } },
      ),
    ),
  ).toBeNull()

  expect(
    prepareAlert(
      update(
        'endpoint',
        { metadata: { supports_reasoning: false } },
        { metadata: { supports_reasoning: true } },
      ),
    ),
  ).toBeNull()

  expect(
    prepareAlert(
      update(
        'endpoint',
        { metadata: { context_length: 100, supports_reasoning: false } },
        { metadata: { context_length: 200, supports_reasoning: true } },
      ),
    ),
  ).toMatchObject({ changes: [{ after: 200, before: 100, path: 'context_length' }] })
})
