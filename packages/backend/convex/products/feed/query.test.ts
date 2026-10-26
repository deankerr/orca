import * as R from 'remeda'
import { expect, test } from 'vitest'

import { api } from '#generated/api'

import { setup } from '../../harness.testing'

test('feed cursors must be stream index keys; anything else is an InvalidCursor', async () => {
  const t = setup()

  const list = async (cursor: string | null, endCursor?: string | null) =>
    await t.query(api.products.feed.query.list, {
      paginationOpts: R.pickBy({ cursor, endCursor, numItems: 1 }, R.isDefined),
    })

  for (const cursor of ['not json', '["2026-10-01T00:00:00.000Z"]', '{}']) {
    await expect(list(cursor)).rejects.toThrow('InvalidCursor')
  }

  await expect(list(null, 'not json')).rejects.toThrow('InvalidCursor')

  const key = JSON.stringify(['2026-10-01T00:00:00.000Z', 1, 'event'])

  for (const endCursor of [undefined, null, key]) {
    await expect(list(key, endCursor)).resolves.toMatchObject({ page: [] })
  }
})
