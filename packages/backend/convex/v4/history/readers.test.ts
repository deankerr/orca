/* oxlint-disable typescript/no-unsafe-type-assertion -- Minimal indexed database doubles exercise registered readers without deploying test mutations. */
import { expect, test } from 'bun:test'

import type { PaginationOptions, RegisteredQuery } from 'convex/server'

import type { QueryCtx } from '../../_generated/server'
import { endpoints, forEndpoint } from './listings/query'
import type { EndpointListingRow } from './listings/table'
import { observe } from './pricing/query'

function handler<Args extends Record<string, unknown>, Result>(
  query: RegisteredQuery<'public', Args, Result>,
) {
  return (query as unknown as { _handler: (ctx: QueryCtx, args: Args) => Promise<Result> })._handler
}

test('historical discovery and complete endpoint context exclude unrelated listings and the clock', async () => {
  const listing = (endpoint_id: string, model_id: string, scan_at: string): EndpointListingRow => ({
    endpoint_id,
    model_id,
    scan_at,
    provider_id: 'provider',
    provider_tag: 'provider',
    state: 'listed',
  })
  const rows = [
    ...Array.from({ length: 9000 }, (_, i) => listing(`other-${i}`, 'unrelated', '2026-01-01')),
    listing('one', 'old-model', '2026-01-01'),
    listing('one', 'old-model', '2026-01-02'),
    listing('one', 'new-model', '2026-01-03'),
  ]
  const ctx = {
    db: {
      query: (table: string) => {
        expect(table).toBe('v4_endpoint_listing_history')
        return {
          withIndex: (
            name: string,
            range: (q: { eq: (field: string, value: string) => void }) => void,
          ) => {
            let selected: EndpointListingRow[] = []
            range({
              eq: (field, value) => {
                expect(name).toBe(`by_${field}_and_scan_at`)
                selected = rows.filter((row) => row[field as keyof EndpointListingRow] === value)
              },
            })
            return { collect: async () => selected }
          },
        }
      },
    },
  } as unknown as QueryCtx

  expect(await handler(endpoints)(ctx, { model_id: 'old-model' })).toEqual(['one'])
  expect(await handler(endpoints)(ctx, { model_id: 'absent' })).toEqual([])
  expect(await handler(forEndpoint)(ctx, { endpoint_id: 'one' })).toEqual(rows.slice(-3))

  rows.push(listing('two', 'old-model', '2026-01-01'))
  expect(await handler(endpoints)(ctx, { model_id: 'old-model' })).toEqual(['one', 'two'])
})

test('live prices use an endpoint-only ascending range, preserve native pagination, and propagate failures', async () => {
  const page = {
    page: [],
    isDone: false,
    continueCursor: 'next',
    pageStatus: 'SplitRequired' as const,
  }
  const failure: { error?: Error } = {}
  let received: PaginationOptions | undefined
  const ctx = {
    db: {
      query: (table: string) => {
        expect(table).toBe('v4_endpoint_pricing_history')
        const query = {
          withIndex: (
            name: string,
            range: (q: { eq: (field: string, value: string) => void }) => void,
          ) => {
            expect(name).toBe('by_endpoint_id_and_scan_at')
            range({
              eq: (field, value) => {
                expect([field, value]).toEqual(['endpoint_id', 'one'])
              },
            })
            return query
          },
          order: (direction: string) => {
            expect(direction).toBe('asc')
            return query
          },
          paginate: async (options: PaginationOptions) => {
            received = options
            if (failure.error) {
              throw failure.error
            }
            return page
          },
        }
        return query
      },
    },
  } as unknown as QueryCtx
  const paginationOpts = {
    numItems: 1000,
    cursor: 'start',
    endCursor: 'end',
    id: 7,
    maximumRowsRead: 1,
    maximumBytesRead: 1000,
  }
  expect(await handler(observe)(ctx, { endpoint_id: 'one', paginationOpts })).toEqual(page)
  expect(received).toEqual(paginationOpts)

  await handler(observe)(ctx, {
    endpoint_id: 'one',
    paginationOpts: { numItems: 1000, cursor: null },
  })
  expect(received).toMatchObject({ maximumRowsRead: 2000, maximumBytesRead: 4_000_000 })

  failure.error = new Error('failed page')
  expect(handler(observe)(ctx, { endpoint_id: 'one', paginationOpts })).rejects.toThrow(
    'failed page',
  )
})
