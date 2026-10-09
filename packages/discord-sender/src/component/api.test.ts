import { expect, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import { convexTest } from 'convex-test'

import { api } from './_generated/api'
import schema from './schema'

function setup() {
  const modules = Object.fromEntries(
    [...new Bun.Glob('**/*.ts').scanSync({ absolute: true, cwd: import.meta.dir })]
      .filter((file) => !file.endsWith('.test.ts') && !file.endsWith('.d.ts'))
      .map((file) => [file, async (): Promise<unknown> => await import(file)]),
  )
  return convexTest({ modules, schema })
}

// JSON.parse accepts this as Infinity, but the Discord boundary requires finite
// JSON values. Admission must reject it before routing or enqueueing any work.
const payload = '{"n":1e999}'
const parserError = /Invalid input|Infinity/

test('submitBatch rejects numeric overflow even without subscribers', async () => {
  const t = setup()

  await rejects(
    t.mutation(api.api.submitBatch, {
      expiresAt: Date.now() + 60_000,
      key: 'overflow',
      messages: [{ key: 'message', payload }],
      topic: 'ingestion',
    }),
    parserError,
  )

  expect(await t.run(async (ctx) => await ctx.db.query('jobs').collect())).toEqual([])
})

test('editMessage rejects numeric overflow before creating a delivery job', async () => {
  const t = setup()
  const { jobId, resultId } = await t.run(async (ctx) => {
    const webhookId = await ctx.db.insert('webhooks', {
      topics: [],
      url: 'https://discord.com/api/v10/webhooks/100000000000000001/test-token',
    })
    const jobId = await ctx.db.insert('jobs', {
      expiresAt: Date.now() + 60_000,
      finishedAt: Date.now(),
      key: 'original',
      messages: [{ key: 'message', kind: 'send', payload: '{"content":"original"}' }],
      outcome: 'succeeded',
      webhookId,
    })
    const resultId = await ctx.db.insert('results', {
      jobId,
      messageKey: 'message',
      result: { kind: 'succeeded', response: { id: '100000000000000002' } },
    })
    return { jobId, resultId }
  })

  // No Workpool registration: this must fail with the parser's error, never a
  // missing-component error caused by reaching enqueueAction with invalid input.
  await rejects(
    t.mutation(api.api.editMessage, {
      expiresAt: Date.now() + 60_000,
      key: 'overflow-edit',
      payload,
      resultId,
    }),
    parserError,
  )

  const jobs = await t.run(async (ctx) => await ctx.db.query('jobs').collect())
  expect(jobs.map((job) => job._id)).toEqual([jobId])
})
