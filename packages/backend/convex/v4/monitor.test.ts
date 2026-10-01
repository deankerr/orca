/* oxlint-disable typescript/no-unsafe-type-assertion -- A database double checks index routing and native cursor forwarding through the registered query. */
import { expect, test } from 'bun:test'
import { deepEqual, equal } from 'node:assert/strict'

import type { PaginationOptions, PaginationResult } from 'convex/server'

import type { QueryCtx } from '../_generated/server'
import type { CuratedEvent } from './eventRenderers/curate'
import { compare } from './events/compare'
import type { EventRow } from './events/query'
import { feed, models } from './monitor'
import type { MonitorScope } from './monitor'

const handler = (
  feed as unknown as {
    _handler: (
      ctx: QueryCtx,
      args: { scope: MonitorScope; paginationOpts: PaginationOptions },
    ) => Promise<PaginationResult<CuratedEvent>>
  }
)._handler

const context = {
  model: { model_id: 'author/model', display_name: 'Model' },
  provider: { provider_id: 'provider/region', display_name: 'Provider' },
  endpoint: {
    endpoint_id: 'endpoint',
    provider_tag: 'offering/tag',
    provider_display_name: 'Offering',
  },
}

const [change] = compare(
  { endpoint: { metadata: { context_length: 100 } } },
  { endpoint: { metadata: { context_length: 200 } } },
)

const row: EventRow = {
  entity_kind: 'endpoint',
  entity_id: 'endpoint',
  type: 'UPDATE',
  scan_at: '2026-10-01T00:00:00.000Z',
  context,
  change_json: JSON.stringify(change),
}

test('Monitor routes activity scopes by captured identity and preserves native pagination through empty selections', async () => {
  const paginationOpts = {
    numItems: 50,
    cursor: 'start',
    endCursor: 'end',
    maximumRowsRead: 100,
    id: 12,
  }

  const page = {
    page: [row],
    isDone: false,
    continueCursor: 'next',
    splitCursor: 'split',
    pageStatus: 'SplitRecommended' as const,
  }

  let index = ''
  let equalities: unknown[][] = []

  const ctx = {
    db: {
      query: (table: string) => {
        equal(table, 'v4_events')
        return {
          withIndex: (name: string, range?: (q: unknown) => unknown) => {
            index = name
            equalities = []

            const q = {
              eq: (...args: unknown[]) => {
                equalities.push(args)
                return q
              },
            }

            range?.(q)
            return {
              order: (direction: string) => {
                expect(direction).toBe('desc')
                return {
                  paginate: async (options: PaginationOptions) => {
                    expect(options).toBe(paginationOpts)
                    return page
                  },
                }
              },
            }
          },
        }
      },
    },
  } as unknown as QueryCtx

  for (const [scope, expectedIndex, expectedEqualities, visible] of [
    [{ kind: 'all' }, 'by_scan_at', [], true],
    [
      { kind: 'model', model_id: 'author/model' },
      'by_model_id_and_scan_at',
      [['context.model.model_id', 'author/model']],
      true,
    ],
    [
      { kind: 'provider', provider_id: 'provider/region' },
      'by_provider_id_and_scan_at',
      [['context.provider.provider_id', 'provider/region']],
      true,
    ],
    [
      { kind: 'endpoint', endpoint_id: 'endpoint' },
      'by_entity_kind_and_entity_id_and_scan_at',
      [
        ['entity_kind', 'endpoint'],
        ['entity_id', 'endpoint'],
      ],
      true,
    ],
    [
      { kind: 'pair', model_id: 'author/model', provider_id: 'provider/region' },
      'by_model_id_and_scan_at',
      [['context.model.model_id', 'author/model']],
      true,
    ],
    [
      { kind: 'pair', model_id: 'author/model', provider_id: 'provider' },
      'by_model_id_and_scan_at',
      [['context.model.model_id', 'author/model']],
      false,
    ],
  ] as const) {
    const result = await handler(ctx, { scope, paginationOpts })
    expect(index).toBe(expectedIndex)
    deepEqual(equalities, expectedEqualities)

    expect(result).toMatchObject({
      isDone: false,
      continueCursor: 'next',
      splitCursor: 'split',
      pageStatus: 'SplitRecommended',
    })

    expect(result.page).toHaveLength(visible ? 1 : 0)
  }
})

test('Monitor model choices require endpoint history and exclude OpenRouter virtual models', async () => {
  const rows = ['01-ai/yi', 'openrouter/auto', 'author/current', 'author/departed'].map(
    (model_id) => ({ model_id, display_name: model_id }),
  )

  const checked: string[] = []
  const page = { page: rows, isDone: false, continueCursor: 'next' }

  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: (index: string, range?: (q: unknown) => unknown) => {
          if (table === 'v4_models') {
            equal(index, 'by_model_id')
            return { paginate: async () => page }
          }

          equal(table, 'v4_endpoint_listing_history')
          equal(index, 'by_model_id_and_scan_at')
          let modelId = ''

          range?.({
            eq: (field: string, value: string) => {
              equal(field, 'model_id')
              modelId = value
            },
          })

          checked.push(modelId)
          return {
            first: async () => (modelId.startsWith('author/') ? { state: 'unlisted' } : null),
          }
        },
      }),
    },
  } as unknown as QueryCtx

  const run = (
    models as unknown as {
      _handler: (
        ctx: QueryCtx,
        args: { paginationOpts: PaginationOptions },
      ) => Promise<PaginationResult<{ id: string; name: string }>>
    }
  )._handler

  const result = await run(ctx, { paginationOpts: { numItems: 1000, cursor: null } })

  deepEqual(result, {
    ...page,
    page: rows.slice(2).map((row) => ({ id: row.model_id, name: row.display_name })),
  })

  deepEqual(checked, ['01-ai/yi', 'author/current', 'author/departed'])
})
