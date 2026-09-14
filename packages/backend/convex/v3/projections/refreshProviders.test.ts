import { expect, test } from 'bun:test'
/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal action context double and access to Convex's runtime handler. */
import assert from 'node:assert/strict'

import { getFunctionName } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { gzipSync } from 'fflate'

import type { ActionCtx } from '../../_generated/server'
import { createScanArtifact } from '../../scan/artifact'
import type { ScanArtifact } from '../../scan/artifact'
import type { MetadataRecord } from '../entities.table'
import { run } from './refreshProviders'

function artifact(scanAt: string, providerIds: string[]) {
  return createScanArtifact(
    [
      {
        model_id: 'author/model',
        variant: 'standard',
        model: {
          slug: 'author/model',
          permaslug: 'author/model',
          input_modalities: ['text'],
          output_modalities: ['text'],
          created_at: '2026-01-01',
          short_name: 'Model',
        },
        endpoints: providerIds.map((id) => ({
          id,
          model_variant_slug: 'author/model',
          variant: 'standard',
          provider_slug: id,
          provider_info: {
            slug: id,
            displayName: id,
            dataPolicy: { termsOfServiceURL: `https://${id}.example/${scanAt}` },
          },
          pricing: { prompt: '1', completion: '2', discount: 0 },
        })),
      },
    ],
    scanAt,
  )
}

function harness(history: ScanArtifact | null) {
  const current = artifact('2026-09-15', ['active', 'not-in-views'])
  const sources = new Map([current, ...(history === null ? [] : [history])].map((a) => [a.id, a]))
  const loaded: string[] = []
  const writes: { rows: { provider_id: string; metadata: MetadataRecord }[] }[] = []
  const ctx = {
    runQuery(
      ref: FunctionReference<'query'>,
      args: {
        name: string
        paginationOpts: { cursor: string | null }
      },
    ) {
      switch (getFunctionName(ref)) {
        case 'v3/projections/queries:providers': {
          const secondPage = args.paginationOpts.cursor !== null
          return {
            page: (secondPage ? ['absent-b'] : ['active', 'absent-a']).map((provider_id) => ({
              provider_id,
              scan_at: '2026-09-12',
              metadata: { obsolete: true },
            })),
            isDone: secondPage,
            continueCursor: 'next',
          }
        }
        case 'v3/ingest:currentArtifactId': {
          return current.id
        }
        case 'objects/locators:get': {
          loaded.push(args.name)
          return sources.has(args.name) ? { backend: 'convex', storage_id: args.name } : null
        }
        default: {
          throw new Error(`Unexpected query: ${getFunctionName(ref)}`)
        }
      }
    },
    storage: {
      get(id: string) {
        const source = sources.get(id)
        assert.ok(source)
        return new Blob([
          gzipSync(
            new TextEncoder().encode(
              source.entries.map((entry) => JSON.stringify(entry)).join('\n'),
            ),
          ),
        ])
      },
    },
    runMutation(_ref: unknown, args: (typeof writes)[number]) {
      writes.push(args)
    },
  } as unknown as ActionCtx
  const handler = (
    run as unknown as { _handler: (ctx: ActionCtx, args: Record<string, never>) => Promise<number> }
  )._handler
  return { execute: async () => await handler(ctx, {}), writes, loaded }
}

test('refreshes providers from current or row scan_at sources without endpoint associations', async () => {
  const h = harness(artifact('2026-09-12', ['absent-a', 'absent-b']))
  expect(await h.execute()).toBe(3)
  expect(h.loaded).toEqual(['scan.2026-09-15.jsonl', 'scan.2026-09-12.jsonl'])
  expect(h.writes).toEqual([
    {
      rows: ['active', 'absent-a', 'absent-b'].map((provider_id) => ({
        provider_id,
        metadata: {
          'dataPolicy.termsOfServiceURL': `https://${provider_id}.example/${provider_id === 'active' ? '2026-09-15' : '2026-09-12'}`,
        },
      })),
    },
  ])
})

test('missing source artifacts abort before any metadata writes', async () => {
  const h = harness(null)
  await assert.rejects(h.execute())
  expect(h.writes).toEqual([])
})

test('a provider missing from its indicated source aborts before any metadata writes', async () => {
  const h = harness(artifact('2026-09-12', ['absent-a']))
  await assert.rejects(h.execute(), /Provider absent-b missing from source/)
  expect(h.writes).toEqual([])
})
