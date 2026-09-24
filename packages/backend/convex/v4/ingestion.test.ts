import { expect, test } from 'bun:test'
import assert from 'node:assert/strict'

import { getFunctionName } from 'convex/server'
import type { FunctionReference } from 'convex/server'
import { gzipSync } from 'fflate'

import type { ActionCtx } from '../_generated/server'
import { run } from './ingestion'
import { nextPhase } from './ingestion/phases'

const A = '2026-09-15T00:00:00.000Z'
const B = '2026-09-16T00:00:00.000Z'
const names = [A, B].map((at) => `scan.${at}.jsonl`)

test('one pair loads shared artifacts once, resumes committed phases, and performs no downstream work', async () => {
  let ingestion: { id: string; from_scan_at: string; scan_at: string; phase: string } | null = null
  let fail = true
  const writes: string[] = []
  const loaded: string[] = []
  const ctx = {
    storage: {
      async get(name: string) {
        loaded.push(name)
        const scanAt = name === names[0] ? A : B
        const text = JSON.stringify({
          scan_at: scanAt,
          model_id: 'model',
          variant: 'standard',
          model: {
            slug: 'model',
            permaslug: 'model',
            short_name: 'Model',
            created_at: A,
            input_modalities: ['text'],
            output_modalities: ['text'],
          },
          endpoints: [],
        })
        return new Blob([gzipSync(new TextEncoder().encode(text))])
      },
    },
    async runQuery(reference: FunctionReference<'query'>, args: Record<string, unknown>) {
      switch (getFunctionName(reference)) {
        case 'v4/ingestion/log:active': {
          return ingestion?.phase === 'complete' ? null : ingestion
        }
        case 'v4/ingestion/clock:current': {
          return ingestion?.phase === 'complete' ? ingestion.scan_at : null
        }
        case 'objects/locators:nextName': {
          return (
            names.find((name) => typeof args.afterName === 'string' && name > args.afterName) ??
            null
          )
        }
        case 'objects/locators:get': {
          return {
            path: 'scans',
            name: args.name,
            backend: 'convex',
            storage_id: args.name,
            codec: 'gzip',
            size: 1,
          }
        }
        default: {
          throw new Error(`Unexpected query ${getFunctionName(reference)}`)
        }
      }
    },
    async runMutation(reference: FunctionReference<'mutation'>, args: Record<string, unknown>) {
      const name = getFunctionName(reference)
      if (name === 'v4/ingestion/log:admit') {
        assert.equal(loaded.length % 2, 0)
        ingestion ??= { id: 'ingestion', from_scan_at: A, scan_at: B, phase: 'baseline_records' }
        return { ...ingestion }
      }
      assert.ok(ingestion)
      assert.equal(args.expectedPhase, ingestion.phase)
      const writers: Record<string, string> = {
        records: 'v4/records/write:writeRecords',
        readings: 'v4/series/readings:writeReadings',
        prices: 'v4/series/prices:writePrices',
        listings: 'v4/series/listings:writeListings',
        models: 'v4/catalog/write:models',
        providers: 'v4/catalog/write:providers',
        endpoints: 'v4/catalog/write:endpoints',
      }
      assert.equal(name, writers[ingestion.phase.split('_')[1] ?? ''])
      if (fail && ingestion.phase === 'forward_providers') {
        fail = false
        throw new Error('Interrupted writer')
      }
      writes.push(ingestion.phase)
      ingestion.phase = nextPhase(ingestion.phase)
      return ingestion.phase
    },
  }
  type TestAction = { _handler: (ctx: ActionCtx, args: object) => Promise<null> }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Access the Convex runtime handler to exercise the action without a deployment.
  const handler = (run as unknown as TestAction)._handler

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The double rejects unexpected calls and deliberately supplies no scheduler or capture operation.
  const actionCtx = ctx as unknown as ActionCtx
  await assert.rejects(handler(actionCtx, {}), /Interrupted writer/)
  expect(loaded).toEqual(names)
  await handler(actionCtx, {})
  expect(loaded).toEqual([...names, ...names])
  expect(writes).toEqual([
    'baseline_records',
    'baseline_readings',
    'baseline_prices',
    'baseline_listings',
    'baseline_models',
    'baseline_providers',
    'baseline_endpoints',
    'forward_records',
    'forward_readings',
    'forward_prices',
    'forward_listings',
    'forward_models',
    'forward_providers',
    'forward_endpoints',
  ])
  await handler(actionCtx, {})
  expect(loaded).toHaveLength(4)
  await assert.rejects(handler(actionCtx, { from_scan_at: A }), /both/)
})
