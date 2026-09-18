/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal Convex context doubles exercise registered runtime handlers without deploying data. */
import { expect, test } from 'bun:test'
import assert from 'node:assert/strict'

import { getFunctionName } from 'convex/server'
import { gzipSync } from 'fflate'

import type { ActionCtx, QueryCtx } from '../_generated/server'
import { currentArtifactId, run } from './ingestion'

test('fresh ingestion selects the latest pair baseline and resumes from the newest receipt', async () => {
  let receipt: { to_artifact_id: string } | null = null
  let artifacts = ['scan.1', 'scan.2', 'scan.3']

  const query = {
    withIndex(name: string) {
      expect(name).toBe('by_to_artifact_id')
      return query
    },
    order(direction: string) {
      expect(direction).toBe('desc')
      return query
    },
    first: async () => receipt,
  }

  const ctx = {
    db: { query: () => query },
    runQuery: async (_ref: unknown, { beforeName }: { beforeName?: string }) =>
      artifacts.findLast((name) => beforeName === undefined || name < beforeName) ?? null,
  } as unknown as QueryCtx

  const handler = (
    currentArtifactId as unknown as {
      _handler: (ctx: QueryCtx, args: object) => Promise<string | null>
    }
  )._handler

  expect(await handler(ctx, {})).toBe('scan.2')
  artifacts = ['scan.1']
  expect(await handler(ctx, {})).toBeNull()
  receipt = { to_artifact_id: 'scan.3' }
  expect(await handler(ctx, {})).toBe('scan.3')
})

test('runner awaits scoped processing before completion, retries failures, and carries its baseline', async () => {
  const before = 'scan.2026-09-15T00:00:00.000Z.jsonl'
  const after = 'scan.2026-09-16T00:00:00.000Z.jsonl'
  const calls: string[] = []
  let failProcessing = true
  let next: string | null = after

  const ctx = {
    runQuery: async (ref: Parameters<typeof getFunctionName>[0], args: { name?: string }) => {
      const name = getFunctionName(ref)

      if (name === 'objects/locators:nextName') {
        return next
      }

      expect(name).toBe('objects/locators:get')
      return { backend: 'convex', storage_id: args.name }
    },
    storage: {
      get: async (id: string) =>
        new Blob([
          gzipSync(
            new TextEncoder().encode(
              JSON.stringify({
                scan_at: id.slice(5, -6),
                model_id: 'model',
                variant: 'standard',
                model: {
                  slug: 'model',
                  permaslug: 'model',
                  input_modalities: ['text'],
                  output_modalities: ['text'],
                  short_name: id,
                  created_at: '',
                },
                endpoints: [],
              }),
            ),
          ),
        ]),
    },
    runMutation: async (ref: Parameters<typeof getFunctionName>[0]) => {
      calls.push(getFunctionName(ref))
      return null
    },
    runAction: async (ref: Parameters<typeof getFunctionName>[0], args: object) => {
      expect(getFunctionName(ref)).toBe('changeEvents/processing:processPendingInputs')
      expect(args).toEqual({ scan_at: '2026-09-16T00:00:00.000Z' })
      calls.push('process')

      if (failProcessing) {
        throw new Error('processing interrupted')
      }

      return null
    },
    scheduler: {
      runAfter: async (
        _delay: number,
        ref: Parameters<typeof getFunctionName>[0],
        args: object,
      ) => {
        expect(getFunctionName(ref)).toBe('changeEvents/ingestion:run')
        expect(args).toEqual({ afterArtifactId: after, process: true })
        calls.push('continue')
      },
    },
  } as unknown as ActionCtx

  const handler = (
    run as unknown as {
      _handler: (
        ctx: ActionCtx,
        args: { afterArtifactId: string; process?: boolean; once?: boolean },
      ) => Promise<null>
    }
  )._handler

  const args = { afterArtifactId: before, process: true }
  await assert.rejects(handler(ctx, args), /processing interrupted/)
  expect(calls).toEqual(['changeEvents/ingestion/store:storeChangeEventInputs', 'process'])
  failProcessing = false
  calls.length = 0
  await handler(ctx, args)

  expect(calls).toEqual([
    'changeEvents/ingestion/store:storeChangeEventInputs',
    'process',
    'changeEvents/ingestion:complete',
    'continue',
  ])

  calls.length = 0
  await handler(ctx, { ...args, once: true, process: false })

  expect(calls).toEqual([
    'changeEvents/ingestion/store:storeChangeEventInputs',
    'changeEvents/ingestion:complete',
  ])

  calls.length = 0
  next = null
  await handler(ctx, args)
  expect(calls).toEqual([])
})
