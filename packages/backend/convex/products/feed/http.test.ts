import type { DefaultFunctionArgs, FunctionReference } from 'convex/server'
import { expect, test } from 'vitest'

import type { ActionCtx } from '#generated/server'

import { testDouble } from '../../doubles.testing'
import { serve } from './http'

const handler = testDouble<{
  _handler: (ctx: ActionCtx, request: Request) => Promise<Response>
}>(serve)._handler

test('HTTP validates scopes and carries opaque cursors across empty JSON pages', async () => {
  const calls: DefaultFunctionArgs[] = []
  let isDone = false

  const ctx = testDouble<ActionCtx>({
    runQuery: async (_reference: FunctionReference<'query'>, args: DefaultFunctionArgs) => {
      calls.push(args)

      return { continueCursor: 'next-position', isDone, page: [] }
    },
  })

  const address =
    'https://example.com/events/feed?model_id=author%2Fmodel&limit=3&cursor=previous-position'

  const response = await handler(ctx, new Request(address))
  const body: unknown = await response.json()
  const next = address.replace('previous-position', 'next-position')
  expect(body).toEqual({ events: [], next })
  expect(calls).toEqual([
    { model_id: 'author/model', paginationOpts: { cursor: 'previous-position', numItems: 3 } },
  ])
  expect(response.headers.get('Link')).toBe(`<${next}>; rel="next"`)
  expect(response.headers.get('Cache-Control')).toBe('no-store')
  expect(response.headers.get('Content-Type')).toBe('application/json; charset=utf-8')

  const unfiltered = await handler(ctx, new Request('https://example.com/events/feed'))
  const page: unknown = await unfiltered.json()
  expect(page).toEqual({ events: [], next: 'https://example.com/events/feed?cursor=next-position' })
  isDone = true
  const end = await handler(ctx, new Request(address))
  const last: unknown = await end.json()
  expect(last).toEqual({ events: [], next: null })
  expect(end.headers.has('Link')).toBe(false)
  const validCalls = calls.length

  for (const search of [
    'limit=0',
    'limit=101',
    'limit=1.5',
    'format=markdown',
    'entity_id=alone',
    'entity_kind=model',
    'model_id=a&provider_id=b',
    'page=2',
    'cursor=',
  ]) {
    const invalid = await handler(ctx, new Request(`https://example.com/events/feed?${search}`))
    expect(invalid.status).toBe(400)
  }

  expect(calls).toHaveLength(validCalls)
})

test('bad continuation cursors are client errors; unrelated query failures remain server errors', async () => {
  for (const message of [
    'Uncaught Error: Failed to parse cursor',
    'InvalidCursor: query changed',
  ]) {
    const ctx = testDouble<ActionCtx>({
      runQuery: async () => {
        throw new Error(message)
      },
    })

    const response = await handler(
      ctx,
      new Request('https://example.com/events/feed?cursor=invalid'),
    )

    expect(response.status).toBe(400)
    const body: unknown = await response.json()
    expect(body).toEqual({ error: 'Invalid cursor. Restart from the feed without a cursor.' })
  }

  const ctx = testDouble<ActionCtx>({
    runQuery: async () => {
      throw new Error('Database unavailable')
    },
  })

  const response = await handler(ctx, new Request('https://example.com/events/feed?cursor=valid'))
  expect(response.status).toBe(500)
  const body: unknown = await response.json()
  expect(body).toEqual({ error: 'Unable to read the feed.' })
})
