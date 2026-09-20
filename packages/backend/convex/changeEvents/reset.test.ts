import { expect, test } from 'bun:test'

import type { FunctionArgs } from 'convex/server'

import type { internal } from '../_generated/api'
import type { ActionCtx, MutationCtx } from '../_generated/server'
import { clearPage, reset } from './reset'

test('reset drains CES events, inputs, and receipts in order while preserving source data', async () => {
  const rows: Record<string, { _id: string }[]> = {
    changeEvents: Array.from({ length: 45 }, (_, index) => ({ _id: `event-${index}` })),
    changeEventInputs: [{ _id: 'input' }],
    changeEventIngestions: [{ _id: 'receipt' }],
    v3_scan_ingestions: [{ _id: 'view-ingestion' }],
    objects_locators: [{ _id: 'scan' }],
  }
  const visited: string[] = []
  const db = {
    query(table: string) {
      return {
        paginate: async ({ numItems }: { numItems: number }) => ({
          page: rows[table].slice(0, numItems),
          isDone: rows[table].length <= numItems,
        }),
      }
    },
    async delete(table: string, id: string) {
      rows[table] = rows[table].filter((row) => row._id !== id)
    },
  }
  type PageHandler = {
    _handler: (
      ctx: MutationCtx,
      args: FunctionArgs<typeof internal.changeEvents.reset.clearPage>,
    ) => Promise<boolean>
  }
  type ResetHandler = { _handler: (ctx: ActionCtx, args: Record<string, never>) => Promise<null> }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise Convex's runtime handlers with a bounded database double.
  const clear = (clearPage as unknown as PageHandler)._handler
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The reset action only needs the runMutation double below.
  const run = (reset as unknown as ResetHandler)._handler
  const ctx = {
    runMutation: async (
      _reference: unknown,
      args: FunctionArgs<typeof internal.changeEvents.reset.clearPage>,
    ) => {
      visited.push(args.table)
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- clearPage only uses query/paginate and delete.
      return await clear({ db } as unknown as MutationCtx, args)
    },
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The action only calls runMutation.
  await run(ctx as unknown as ActionCtx, {})

  expect(visited).toEqual([
    'changeEvents',
    'changeEvents',
    'changeEvents',
    'changeEventInputs',
    'changeEventIngestions',
  ])
  expect(rows).toEqual({
    changeEvents: [],
    changeEventInputs: [],
    changeEventIngestions: [],
    v3_scan_ingestions: [{ _id: 'view-ingestion' }],
    objects_locators: [{ _id: 'scan' }],
  })
})
