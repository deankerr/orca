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

test('shared selection keeps provider identity and links, and leaves reasoning to model alerts', () => {
  const provider = update(
    'provider',
    { metadata: {} },
    {
      metadata: {
        dataPolicy: { privacyPolicyURL: 'https://example.com/privacy', training: false },
      },
    },
  )

  // Contract fields read through the added policy object; its unpublished facts never appear.
  for (const alert of [prepareAlert(provider), curate(provider)]) {
    expect(alert).toEqual(
      expect.objectContaining({
        changes: [
          {
            after: 'https://example.com/privacy',
            before: null,
            field: 'privacy_policy_url',
            kind: 'text',
          },
        ],
      }),
    )
  }

  const byok = update('provider', { metadata: {} }, { metadata: { byokEnabled: true } })

  expect(curate(byok)).toMatchObject({ changes: [{ field: 'byok_enabled' }] })
  expect(prepareAlert(byok)).toBeNull()

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
  ).toMatchObject({ changes: [{ after: 200, before: 100, field: 'context_length' }] })
})
