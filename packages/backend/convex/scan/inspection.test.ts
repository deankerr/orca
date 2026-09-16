/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal storage double invokes the actual Convex action handler. */
import { expect, test } from 'bun:test'
import assert from 'node:assert/strict'

import type { ApiFromModules, FunctionArgs, FunctionReturnType } from 'convex/server'
import { gzipSync } from 'fflate'
import { applyChangeset } from 'json-diff-ts'

import type { ActionCtx } from '../_generated/server'
import { ScanProjection } from '../projections'
import { compare } from './inspection'
import type { InspectionResult } from './inspection'

type Compare = ApiFromModules<{ inspection: { compare: typeof compare } }>['inspection']['compare']

function artifact(scan_at: string, ids: string[], status: number) {
  return {
    id: `scan.${scan_at}.jsonl`,
    scan_at,
    entries: [
      {
        model_id: 'author/model',
        variant: 'standard',
        scan_at,
        model: {
          slug: 'author/model',
          permaslug: 'author/model',
          short_name: 'Model',
          created_at: '2026-01-01',
          input_modalities: ['text'],
          output_modalities: ['text'],
        },
        endpoints: ids.map((id) => ({
          id,
          model_variant_slug: 'author/model',
          variant: 'standard',
          provider_slug: 'provider',
          provider_info: { slug: 'provider', displayName: 'Provider' },
          pricing: { prompt: '1', completion: '2', discount: 0 },
          status,
          stats: { endpoint_id: id, latency: status },
        })),
      },
    ],
  }
}

test('compares arbitrary pairs and initial state, with added, removed and unchanged owner context', async () => {
  const before = artifact('2026-09-01', ['changed', 'removed'], 0)
  const after = artifact('2026-09-16', ['changed', 'added'], 1)
  const sources = new Map([before, after].map((source) => [source.id, source]))
  const ctx = {
    runQuery: (_ref: unknown, { name }: { name: string }) =>
      sources.has(name) ? { backend: 'convex', storage_id: name } : null,
    storage: {
      get: (id: string) => {
        const source = sources.get(id)
        assert.ok(source)
        return new Blob([
          gzipSync(
            new TextEncoder().encode(source.entries.map((row) => JSON.stringify(row)).join('\n')),
          ),
        ])
      },
    },
  } as unknown as ActionCtx
  const handler = (
    compare as unknown as {
      _handler: (
        ctx: ActionCtx,
        args: FunctionArgs<Compare>,
      ) => Promise<FunctionReturnType<Compare>>
    }
  )._handler
  async function request(args: FunctionArgs<Compare>) {
    const text = await handler(ctx, args)
    expect(typeof text).toBe('string')
    const result = JSON.parse(text) as InspectionResult
    expect(Object.keys(result.document)).toEqual(['version', 'from', 'to', 'changes'])
    return result
  }
  const pair = { fromArtifactId: before.id, toArtifactId: after.id }
  const result = await request(pair)
  expect(result.document.from.artifactId).toBe(before.id)
  expect(applyChangeset(ScanProjection.parse(before).catalog, result.document.changes)).toEqual(
    ScanProjection.parse(after).catalog,
  )
  expect(JSON.stringify(result.document)).not.toContain('latency')

  for (const id of ['changed', 'added', 'removed']) {
    const focused = await request({ ...pair, owner: { collection: 'endpoints', id } })
    expect(focused.document.changes[0]?.changes?.map((change) => change.key)).toEqual([id])
    expect(focused.owner?.before === null).toBe(id === 'added')
    expect(focused.owner?.after === null).toBe(id === 'removed')
  }
  const unchanged = await request({
    ...pair,
    owner: { collection: 'models', id: 'author/model' },
  })
  expect(unchanged.document.changes).toEqual([])
  expect(unchanged.owner?.before).toEqual(unchanged.owner?.after)
  const absent = await request({ ...pair, owner: { collection: 'models', id: 'toString' } })
  expect(absent.owner?.before).toBeNull()
  expect(absent.owner?.after).toBeNull()
  const initial = await request({ fromArtifactId: null, toArtifactId: after.id })
  expect(
    applyChangeset({ models: {}, providers: {}, endpoints: {} }, initial.document.changes),
  ).toEqual(ScanProjection.parse(after).catalog)
  await assert.rejects(
    handler(ctx, { ...pair, fromArtifactId: 'missing' }),
    /Scan artifact not found: missing/,
  )
})
