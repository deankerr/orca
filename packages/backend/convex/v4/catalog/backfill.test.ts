/* oxlint-disable typescript/no-unsafe-type-assertion -- A small database double exercises real backfill decisions and writes without touching a deployment. */
import { expect, test } from 'bun:test'
import { ok } from 'node:assert/strict'

import type { RegisteredMutation } from 'convex/server'

import type { MutationCtx } from '../../_generated/server'
import { batch } from './backfill'

function handler<Args extends Record<string, unknown>, Result>(
  fn: RegisteredMutation<'internal', Args, Result>,
) {
  return (fn as unknown as { _handler: (ctx: MutationCtx, args: Args) => Promise<Result> })._handler
}

test('backfill previews, bounds dates, preserves populated rows and resumes across all catalog tables', async () => {
  const baseline = '2025-08-13T20:19:21.211Z'
  const later = '2026-01-01T00:00:00.000Z'
  const latest = '2026-09-30T00:00:00.000Z'
  const rows: Record<string, Record<string, unknown>[]> = {
    v4_models: [
      { _id: 'a', model_id: 'baseline', scan_at: latest },
      { _id: 'b', model_id: 'listed', scan_at: latest },
      { _id: 'c', model_id: 'sarvamai/sarvam-m', scan_at: latest },
      { _id: 'd', model_id: 'openrouter/auto-beta', scan_at: latest },
      { _id: 'e', model_id: 'already-known', scan_at: latest, from_scan_at: baseline },
      { _id: 'f', model_id: 'too-late', scan_at: baseline },
      { _id: 'g', model_id: 'too-early', scan_at: latest },
    ],
    v4_providers: [{ _id: 'p', provider_id: 'provider', scan_at: latest }],
    v4_endpoints: [
      {
        _id: 'e',
        endpoint_id: 'endpoint',
        provider_id: 'provider',
        model_id: 'listed',
        scan_at: latest,
      },
    ],
    v4_endpoint_listing_history: [
      { model_id: 'listed', provider_id: 'provider', endpoint_id: 'endpoint', scan_at: later },
      { model_id: 'listed', scan_at: latest },
      // A later standard endpoint must not override the earlier verified historical appearance.
      { model_id: 'sarvamai/sarvam-m', scan_at: latest },
      { model_id: 'too-late', scan_at: later },
      { model_id: 'too-early', scan_at: '2025-01-01T00:00:00.000Z' },
    ],
  }
  const original = structuredClone(rows)
  const patches: string[] = []
  const ctx = {
    db: {
      query: (table: string) => ({
        withIndex: (
          _index: string,
          select?: (q: { eq: (key: string, value: string) => void }) => unknown,
        ) => {
          let selected = rows[table]
          select?.({
            eq: (key, value) => {
              selected = selected.filter((row) => row[key] === value)
            },
          })

          return {
            first: async () =>
              selected.toSorted((a, b) => String(a.scan_at).localeCompare(String(b.scan_at)))[0] ??
              null,
            paginate: async ({ cursor, numItems }: { cursor: string | null; numItems: number }) => {
              expect(numItems).toBe(50)
              const start = Number(cursor ?? 0)
              return {
                page: selected.slice(start, start + 2),
                isDone: start + 2 >= selected.length,
                continueCursor: String(start + 2),
              }
            },
          }
        },
      }),
      patch: async (table: string, id: string, patch: Record<string, unknown>) => {
        expect(Object.keys(patch)).toEqual(['from_scan_at'])
        const row = rows[table].find((item) => item._id === id)
        ok(row)
        Object.assign(row, patch)
        patches.push(`${table}:${id}`)
      },
    },
  } as unknown as MutationCtx
  const runBatch = handler(batch)

  async function run(apply: boolean) {
    const decisions = []

    for (const kind of ['model', 'provider', 'endpoint'] as const) {
      let cursor: string | null = null

      for (;;) {
        const page = await runBatch(ctx, {
          kind,
          baseline_scan_at: baseline,
          baseline_models: ['baseline'],
          cursor,
          apply,
        })
        decisions.push(...page.decisions)

        if (page.done) {
          break
        }

        const { cursor: nextCursor } = page
        cursor = nextCursor
      }
    }

    return decisions
  }

  const preview = await run(false)
  expect(rows).toEqual(original)
  expect(patches).toEqual([])
  expect(preview.map(({ entity_id, source, invalid }) => [entity_id, source, invalid])).toEqual([
    ['baseline', 'baseline', false],
    ['listed', 'listings', false],
    ['sarvamai/sarvam-m', 'verified_artifact', false],
    ['openrouter/auto-beta', 'unresolved', false],
    ['already-known', 'existing', false],
    ['too-late', 'listings', true],
    ['too-early', 'listings', true],
    ['provider', 'listings', false],
    ['endpoint', 'listings', false],
  ])
  expect(await run(true)).toEqual(preview)
  expect(patches).toHaveLength(5)
  expect(rows.v4_models[2].from_scan_at).toBe('2025-09-02T15:11:38.534Z')
  await run(true)
  expect(patches).toHaveLength(5)

  for (const [table, records] of Object.entries(rows)) {
    for (const [i, row] of records.entries()) {
      const { from_scan_at: _from, ...rest } = row
      const { from_scan_at: _originalFrom, ...originalRest } = original[table][i]
      expect(rest).toEqual(originalRest)
    }
  }
})
