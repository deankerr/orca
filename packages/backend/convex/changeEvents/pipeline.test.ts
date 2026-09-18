import { expect, test } from 'bun:test'
import assert from 'node:assert/strict'

import type { Infer } from 'convex/values'
import { getDocumentSize } from 'convex/values'

import type { ActionCtx, MutationCtx } from '../_generated/server'
import { compareScanProjections, ScanProjection } from '../projections'
import { renderEvent } from '../textFeed/markdown'
import { complete, ingestComparison } from './ingestion'
import { extractChangeEventInputs } from './ingestion/extract'
import { storeChangeEventInputs } from './ingestion/store'
import { processPendingInputs, processPage } from './processing'
import { EntityChangeContent, ChangeEventInputContent } from './schema'
import type { entityChangeFields } from './schema'

function project(
  day: number,
  args: { present?: boolean; price?: string; name?: string; status?: number } = {},
) {
  const scan_at = `2026-09-${day}T00:00:00.000Z`
  return ScanProjection.parse({
    id: `scan.${scan_at}.jsonl`,
    scan_at,
    entries:
      args.present === false
        ? []
        : [
            {
              model_id: 'model',
              variant: 'standard',
              model: {
                slug: 'model',
                permaslug: 'model',
                short_name: args.name ?? 'Historical [model]',
                created_at: '',
                input_modalities: ['text'],
                output_modalities: ['text'],
              },
              endpoints: [
                {
                  id: 'endpoint',
                  variant: 'standard',
                  provider_slug: 'provider',
                  provider_info: { slug: 'provider', displayName: 'Provider' },
                  pricing: {
                    prompt: args.price ?? '0.00000001',
                    completion: '0.00000002',
                    discount: 0,
                  },
                  status: args.status ?? 0,
                },
              ],
            },
          ],
  })
}

test('initial comparison writes appearances in bounded chunks with no previous observation', async () => {
  const initial = ScanProjection.parse({ id: 'initial', scan_at: '', entries: [] })
  const next = project(15)
  for (let index = 0; index < 25; index += 1) {
    next.catalog.models[`extra-${index}`] = {
      ...next.catalog.models.model,
      metadata: { description: 'x'.repeat(index % 2 === 0 ? 180_000 : 30_000) },
    }
  }
  const comparison = compareScanProjections(initial, next)
  const changes = [...extractChangeEventInputs(comparison)]
  expect(changes).toHaveLength(28)
  for (const change of changes) {
    expect(change.from_scan_at).toBeNull()
    expect(change.category).toBe('lifecycle')
    const { assigned, context } = ChangeEventInputContent.parse(JSON.parse(change.content))
    expect(assigned.before).toBeNull()

    const event = EntityChangeContent.parse({
      changes: assigned,
      context,
    })

    expect(renderEvent({ ...change, _id: 'initial', content: JSON.stringify(event) })).toContain(
      'Observed 2026-09-15 00:00:00 UTC',
    )
  }
  let writes = 0
  const accepted: Infer<typeof entityChangeFields>[] = []

  await ingestComparison(
    {
      runMutation: async (_reference, args) => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Generic runMutation erases arguments; ingestion always supplies this input shape.
        const inputs = args.inputs as Infer<typeof entityChangeFields>[]

        expect(
          inputs.reduce(
            (bytes, input) => bytes + getDocumentSize({ ...input, processed: false }),
            0,
          ),
        ).toBeLessThanOrEqual(4 * 1024 * 1024)

        accepted.push(...inputs)
        writes += 1
        return null
      },
    },
    comparison,
  )

  expect(writes).toBe(2)
  expect(accepted).toEqual(changes)
  expect(Math.max(...changes.map((change) => getDocumentSize(change)))).toBeGreaterThan(256_000)
})

test('split pricing and attributes into independently renderable changes with historical context', () => {
  const comparison = compareScanProjections(
    project(15),
    project(16, { price: '0.000000011', status: 1 }),
  )

  const changes = [...extractChangeEventInputs(comparison)]
  expect(changes.map((change) => change.category)).toEqual(['pricing', 'attributes'])
  const content = ChangeEventInputContent.parse(JSON.parse(changes[0].content))
  expect(content.context.before.model).toHaveProperty('display_name', 'Historical [model]')
  expect(content.context.before.entity?.metadata).toHaveProperty('status', 0)
  expect(content.context.after.entity?.metadata).toHaveProperty('status', 1)
  expect(content.assigned.before).not.toHaveProperty('metadata')
  expect(content.assigned.after).not.toHaveProperty('metadata')

  const markdown = renderEvent({
    ...changes[0],
    _id: 'test-event',
    content: JSON.stringify({
      ...content,
      changes: content.assigned,
    }),
  })

  expect(markdown).toContain('Historical \\[model\\]')

  expect(markdown).toContain(
    'Input price changed from $0.01 per million tokens to $0.011 per million tokens',
  )

  expect(markdown).not.toContain('Status changed')
  expect(markdown).toContain('Observed 2026-09-15')
  expect(markdown).toContain('[Full event](/ces/events/test-event)')
  const update = ChangeEventInputContent.parse(JSON.parse(changes[1].content))
  expect(update.assigned.after).not.toHaveProperty('pricing')

  const updateMarkdown = renderEvent({
    ...changes[1],
    _id: 'update-event',
    content: JSON.stringify({
      ...update,
      changes: update.assigned,
    }),
  })

  expect(updateMarkdown).toContain('Status changed')
  expect(updateMarkdown).not.toContain('Input price')
})

test('lifecycle changes replace field updates and unchanged comparisons produce no inputs', () => {
  const removal = compareScanProjections(project(16), project(17, { present: false }))
  const removed = [...extractChangeEventInputs(removal)]
  expect(removed).toHaveLength(3)
  expect(removed.map((event) => event.entity_kind)).toEqual(['model', 'provider', 'endpoint'])
  for (const change of removed) {
    const content = ChangeEventInputContent.parse(JSON.parse(change.content))
    expect(change.category).toBe('lifecycle')
    expect(content.assigned.after).toBeNull()

    expect(
      renderEvent({
        ...change,
        _id: 'test-event',
        content: JSON.stringify({
          ...content,
          changes: content.assigned,
        }),
      }),
    ).toContain('disappeared from the observed catalog')
  }
  const addition = compareScanProjections(project(16, { present: false }), project(17))
  expect([...extractChangeEventInputs(addition)]).toHaveLength(3)

  expect([...extractChangeEventInputs(compareScanProjections(project(16), project(17)))]).toEqual(
    [],
  )
})

test('presentation exposes late text edits, structured row changes, and precise small prices', () => {
  const [change] = [
    ...extractChangeEventInputs(
      compareScanProjections(project(15), project(16, { price: '0.000000000000000000001' })),
    ),
  ]

  const evidence = ChangeEventInputContent.parse(JSON.parse(change.content))

  const content = EntityChangeContent.parse({
    changes: evidence.assigned,
    context: evidence.context,
  })

  const { before, after } = content.changes

  if (before === null || after === null) {
    throw new Error('Expected an update')
  }

  before.description = `${'unchanged '.repeat(80)}old ending`
  after.description = `${'unchanged '.repeat(80)}new ending`
  before.schedule = [{ starts: '09:00', price: '0.1' }]
  after.schedule = [{ starts: '10:00', price: '0.2' }]
  const markdown = renderEvent({ ...change, _id: 'test-event', content: JSON.stringify(content) })
  expect(markdown).toContain('old ending')
  expect(markdown).toContain('new ending')
  expect(markdown).toContain('Schedule / entry 1 / starts changed from “09:00” to “10:00”')
  expect(markdown).toContain('$0.000000000000001 per million tokens')
})

test('malformed event content fails visibly', () => {
  const [change] = [
    ...extractChangeEventInputs(compareScanProjections(project(15), project(16, { status: 1 }))),
  ]

  expect(() => renderEvent({ ...change, _id: 'test-event', content: '{broken' })).toThrow()
  expect(() => renderEvent({ ...change, _id: 'test-event', content: '{}' })).toThrow()
})

test('processing traverses all pages without relying on completion or output counts', async () => {
  const results = [
    { cursor: 'first', done: false, considered: 20 },
    { cursor: 'second', done: false, considered: 0 },
    { cursor: 'end', done: true, considered: 7 },
  ]

  let calls = 0
  const cursors: (string | null)[] = []

  const ctx = {
    runMutation: async (_reference: unknown, args: { cursor: string | null }) => {
      cursors.push(args.cursor)
      const result = results[calls]
      calls += 1

      if (result === undefined) {
        throw new Error('Processor ran past the end of input')
      }

      return result
    },
  }
  type TestAction = { _handler: (ctx: ActionCtx, args: Record<string, never>) => Promise<null> }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Access the Convex runtime handler for a minimal action double.
  const handler = (processPendingInputs as unknown as TestAction)._handler
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This action only needs runMutation; the double supplies it.
  expect(await handler(ctx as unknown as ActionCtx, {})).toBeNull()
  expect(cursors).toEqual([null, 'first', 'second'])
  expect(calls).toBe(3)
})

test('partial inputs publish independently, scoped processing retries, and receipts allow backfill', async () => {
  const rows: Record<string, Record<string, unknown>[]> = {
    changeEventInputs: [],
    changeEvents: [],
    v3_scan_ingestions: [{ scan_at: '2026-09-20T00:00:00.000Z' }],
    changeEventIngestions: [],
  }

  const db = {
    query(table: string) {
      let matches = rows[table]

      const query = {
        order: () => query,
        first: async () => matches.at(-1) ?? null,
        unique: async () => {
          expect(matches.length).toBeLessThanOrEqual(1)
          return matches[0] ?? null
        },
        paginate: async () => ({ page: [...matches], continueCursor: 'end', isDone: true }),
        withIndex: (_name: string, select: (range: unknown) => unknown) => {
          const range = {
            eq(field: string, value: unknown) {
              matches = matches.filter((row) => row[field] === value)
              return range
            },
          }

          select(range)
          return query
        },
      }
      return query
    },
    async insert(table: string, value: Record<string, unknown>) {
      const _id = `${table}-${rows[table].length}`
      rows[table].push({ ...value, _id })
      return _id
    },
    async patch(table: string, id: string, fields: Record<string, unknown>) {
      const row = rows[table].find((candidate) => candidate._id === id)

      if (row === undefined) {
        throw new Error('Missing row')
      }

      Object.assign(row, fields)
    },
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The database double implements only the operations used by these handlers.
  const ctx = { db } as unknown as MutationCtx
  type AppendHandler = {
    _handler: (
      ctx: MutationCtx,
      args: { inputs: Infer<typeof entityChangeFields>[] },
    ) => Promise<null>
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise Convex's runtime handler without deploying test data.
  const write = (storeChangeEventInputs as unknown as AppendHandler)._handler
  type StepHandler = {
    _handler: (
      ctx: MutationCtx,
      args: { cursor: string | null; scan_at?: string },
    ) => Promise<{ considered: number }>
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise scoped processing and event writes with the same database double.
  const processChanges = (processPage as unknown as StepHandler)._handler

  const changes = [
    ...extractChangeEventInputs(
      compareScanProjections(
        ScanProjection.parse({ id: 'initial', scan_at: '', entries: [] }),
        project(15),
      ),
    ),
  ]

  await write(ctx, { inputs: changes.slice(0, 1) })
  const beforeIngestion = await processChanges(ctx, { cursor: null })
  expect(beforeIngestion.considered).toBe(1)
  await write(ctx, { inputs: changes })

  const reordered = changes.map((change) => {
    const content = ChangeEventInputContent.parse(JSON.parse(change.content))

    if (content.context.after.entity !== null) {
      content.context.after.entity = Object.fromEntries(
        Object.entries(content.context.after.entity).toReversed(),
      )
    }

    return {
      ...change,
      content: JSON.stringify({ context: content.context, assigned: content.assigned }),
    }
  })

  await write(ctx, { inputs: reordered })
  expect(rows.changeEventInputs).toHaveLength(3)
  type CompleteHandler = {
    _handler: (
      ctx: MutationCtx,
      scan: { from_artifact_id: string; to_artifact_id: string; scan_at: string },
    ) => Promise<null>
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Exercise the independent CES completion record with the database double.
  const finish = (complete as unknown as CompleteHandler)._handler
  const scan = { from_artifact_id: 'initial', to_artifact_id: 'next', scan_at: changes[0].scan_at }
  await finish(ctx, scan)
  await finish(ctx, scan)
  expect(rows.changeEventIngestions).toHaveLength(1)
  expect(rows.v3_scan_ingestions).toEqual([{ scan_at: '2026-09-20T00:00:00.000Z' }])
  await assert.rejects(finish(ctx, { ...scan, from_artifact_id: 'different' }), /Retry changed/)

  await finish(ctx, {
    from_artifact_id: 'older',
    to_artifact_id: 'historical',
    scan_at: '2026-09-14T00:00:00.000Z',
  })

  expect(rows.changeEventIngestions).toHaveLength(2)

  const future = {
    ...changes[0],
    from_scan_at: changes[0].scan_at,
    scan_at: '2026-09-16T00:00:00.000Z',
  }

  await write(ctx, { inputs: [future] })
  const afterIngestion = await processChanges(ctx, { cursor: null, scan_at: changes[0].scan_at })
  expect(afterIngestion.considered).toBe(2)
  expect(rows.changeEvents).toHaveLength(3)

  expect(rows.changeEventInputs.map((change) => change.processed)).toEqual([
    true,
    true,
    true,
    false,
  ])

  await write(ctx, { inputs: reordered })
  const afterRetry = await processChanges(ctx, { cursor: null, scan_at: changes[0].scan_at })
  expect(afterRetry.considered).toBe(0)
  expect(rows.changeEvents).toHaveLength(3)
  const altered = ChangeEventInputContent.parse(JSON.parse(changes[0].content))
  altered.assigned.after = { different: true }

  await assert.rejects(
    write(ctx, { inputs: [{ ...changes[0], content: JSON.stringify(altered) }] }),
    /Retry changed/,
  )
  for (const event of rows.changeEvents) {
    expect(event.input_ids).toHaveLength(1)
    expect(event.entity_kind).toBeString()
    expect(event.entity_id).toBeString()
    expect(event.category).toBe('lifecycle')
    expect(event.scan_at).toBe(changes[0].scan_at)
    expect(event.from_scan_at).toBeNull()
    expect(EntityChangeContent.parse(JSON.parse(String(event.content))).changes.before).toBeNull()
  }
  const unscoped = await processChanges(ctx, { cursor: null })
  expect(unscoped.considered).toBe(1)
  expect(rows.changeEvents).toHaveLength(4)
})
