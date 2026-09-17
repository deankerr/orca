import { expect, test } from 'bun:test'

import type { ActionCtx } from '../../_generated/server'
import { compareScanProjections, ScanProjection } from '../../projections'
import { consume } from './consume'
import { EntityChange, readJobContent } from './entityChange'
import { prepare } from './ingestion/prepare'
import { renderEntry, renderEvent } from './presentation/markdown'
import { run } from './processing/run'

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

test('ordinary ingestion establishes its initial baseline without creating appearance jobs', async () => {
  const initial = ScanProjection.parse({ id: 'initial', scan_at: '', entries: [] })
  await consume(
    {
      runMutation: async () => {
        throw new Error('The baseline must not write CES jobs')
      },
    },
    compareScanProjections(initial, project(15)),
  )
})

test('split pricing and other updates into independently renderable jobs with historical context', () => {
  const comparison = compareScanProjections(
    project(15),
    project(16, { price: '0.000000011', status: 1 }),
  )
  const jobs = [...prepare(comparison)]
  expect(jobs.map((job) => job.category)).toEqual(['pricing', 'update'])
  const content = readJobContent(jobs[0].content)
  expect(content.context.before.model).toHaveProperty('display_name', 'Historical [model]')
  expect(content.context.before.entity?.metadata).toHaveProperty('status', 0)
  expect(content.context.after.entity?.metadata).toHaveProperty('status', 1)
  expect(content.changes.before).not.toHaveProperty('metadata')
  expect(content.changes.after).not.toHaveProperty('metadata')
  const markdown = renderEntry({
    _id: 'test-event',
    content: EntityChange.parse({ ...jobs[0], ...content, type: 'entity-change' }),
  })
  expect(markdown).toContain('Historical \\[model\\]')
  expect(markdown).toContain(
    'Input price changed from $0.01 per million tokens to $0.011 per million tokens',
  )
  expect(markdown).not.toContain('Status changed')
  expect(markdown).toContain('Observed 2026-09-15')
  expect(markdown).toContain('[Full event](/ces/events/test-event)')
  const update = readJobContent(jobs[1].content)
  expect(update.changes.after).not.toHaveProperty('pricing')
  const updateMarkdown = renderEntry({
    _id: 'update-event',
    content: EntityChange.parse({ ...jobs[1], ...update, type: 'entity-change' }),
  })
  expect(updateMarkdown).toContain('Status changed')
  expect(updateMarkdown).not.toContain('Input price')
})

test('lifecycle jobs replace field updates and unchanged comparisons produce no jobs', () => {
  const removal = compareScanProjections(project(16), project(17, { present: false }))
  const removed = [...prepare(removal)]
  expect(removed).toHaveLength(3)
  expect(removed.map((event) => event.collection)).toEqual(['models', 'providers', 'endpoints'])
  for (const job of removed) {
    const content = readJobContent(job.content)
    expect(job.category).toBe('lifecycle')
    expect(content.changes.after).toBeNull()
    expect(
      renderEntry({
        _id: 'test-event',
        content: EntityChange.parse({ ...job, ...content, type: 'entity-change' }),
      }),
    ).toContain('disappeared from the observed catalog')
  }
  const addition = compareScanProjections(project(16, { present: false }), project(17))
  expect([...prepare(addition)]).toHaveLength(3)
  expect([...prepare(compareScanProjections(project(16), project(17)))]).toEqual([])
})

test('presentation exposes late text edits, structured row changes, and precise small prices', () => {
  const [job] = [
    ...prepare(
      compareScanProjections(project(15), project(16, { price: '0.000000000000000000001' })),
    ),
  ]
  const content = EntityChange.parse({
    ...job,
    ...readJobContent(job.content),
    type: 'entity-change',
  })
  const { before, after } = content.changes
  if (before === null || after === null) {
    throw new Error('Expected an update')
  }
  before.description = `${'unchanged '.repeat(80)}old ending`
  after.description = `${'unchanged '.repeat(80)}new ending`
  before.schedule = [{ starts: '09:00', price: '0.1' }]
  after.schedule = [{ starts: '10:00', price: '0.2' }]
  const markdown = renderEntry({ _id: 'test-event', content })
  expect(markdown).toContain('old ending')
  expect(markdown).toContain('new ending')
  expect(markdown).toContain('Schedule / entry 1 / starts changed from “09:00” to “10:00”')
  expect(markdown).toContain('$0.000000000000001 per million tokens')
})

test('unsupported event formats expose complete JSON instead of being omitted or caught as errors', () => {
  const content = { type: 'provider-policy', detail: '```\nnew policy', endpoints: ['a', 'b'] }
  const markdown = renderEvent({ _id: 'test-event', content: JSON.stringify(content) })
  expect(markdown).toContain('    "type": "provider-policy"')
  expect(markdown).toContain('new policy')
  expect(markdown).toContain('"a"')
  expect(markdown).not.toContain('Unknown event')
  expect(() => renderEvent({ _id: 'test-event', content: '{broken' })).toThrow()
  expect(() => renderEvent({ _id: 'test-event', content: '{"type":"entity-change"}' })).toThrow()
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
  const handler = (run as unknown as TestAction)._handler
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- This action only needs runMutation; the double supplies it.
  expect(await handler(ctx as unknown as ActionCtx, {})).toBeNull()
  expect(cursors).toEqual([null, 'first', 'second'])
  expect(calls).toBe(3)
})
