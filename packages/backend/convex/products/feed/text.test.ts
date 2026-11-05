import { expect, test } from 'vitest'

import type { AlertChange, EntityAlert } from '../shared/alerts/curate'
import { describe } from './text'

const updated = (change: AlertChange): EntityAlert => ({
  changes: [change],
  context: { model: { display_name: 'Model', model_id: 'author/model' } },
  entity_id: 'author/model',
  entity_kind: 'model',
  observed_at: '2026-11-05T13:00:00.000Z',
  type: 'model_updated',
})

test('feed text reads dates in UTC to the minute', () => {
  expect(
    describe(
      updated({
        after: '2026-12-01T13:00:00.000Z',
        before: null,
        field: 'deprecation_date',
        kind: 'date',
      }),
    ),
  ).toEqual(['Deprecation date was added: 2026-12-01 13:00 UTC.'])
})
