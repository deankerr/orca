import type { PaginationOptions } from 'convex/server'
import { expect, test } from 'vitest'

import { EVENTS_TABLE } from '../../../catalog/tables/events'
import { setup } from '../../../harness.testing'
import { INGESTION_RECORDS_TABLE } from '../../../ingestion/tables'
import { readPage } from './read'

const SCAN_AT = '2026-10-01T00:00:00.000Z'

/** A completed scan and five model Events, newest scan first in the stream. */
async function seeded() {
  const t = setup()

  await t.run(async (ctx) => {
    await ctx.db.insert(INGESTION_RECORDS_TABLE, {
      alerts: true,
      from_scan_at: '2026-09-30T00:00:00.000Z',
      kind: 'pair',
      scan_at: SCAN_AT,
      state: 'complete',
    })

    for (const minute of [1, 2, 3, 4, 5]) {
      await ctx.db.insert(EVENTS_TABLE, {
        change_json: '{}',
        context: { model: { display_name: `Model ${minute}`, model_id: `model-${minute}` } },
        entity_id: `model-${minute}`,
        entity_kind: 'model',
        scan_at: `2026-09-30T00:0${minute}:00.000Z`,
        type: 'UPDATE',
      })
    }
  })

  const read = async (options: PaginationOptions) =>
    await t.run(async (ctx) => {
      const result = await readPage(ctx, { kind: 'all' }, options)

      return { ...result, page: result.page.map((row) => row.entity_id) }
    })

  return { read }
}

test('feed cursors continue and bound pages by stream position', async () => {
  const { read } = await seeded()

  const first = await read({ cursor: null, numItems: 2 })
  expect(first.page).toEqual(['model-5', 'model-4'])

  const second = await read({ cursor: first.continueCursor, numItems: 2 })
  expect(second.page).toEqual(['model-3', 'model-2'])

  // A keyed end cursor replays a page exactly; a null one is no bound.
  const replayed = await read({ cursor: null, endCursor: first.continueCursor, numItems: 10 })
  expect(replayed.page).toEqual(['model-5', 'model-4'])

  const rest = await read({ cursor: first.continueCursor, endCursor: null, numItems: 10 })
  expect(rest.page).toEqual(['model-3', 'model-2', 'model-1'])
})

test('feed cursors must be stream index keys; anything else is an InvalidCursor', async () => {
  const { read } = await seeded()

  for (const cursor of ['not json', '["2026-10-01T00:00:00.000Z"]', '{}']) {
    await expect(read({ cursor, numItems: 1 })).rejects.toThrow('InvalidCursor')
  }

  await expect(read({ cursor: null, endCursor: 'not json', numItems: 1 })).rejects.toThrow(
    'InvalidCursor',
  )
})
