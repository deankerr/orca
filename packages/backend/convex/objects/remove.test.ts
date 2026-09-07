import { expect, spyOn, test } from 'bun:test'
import assert from 'node:assert/strict'

/* eslint-disable typescript/no-unsafe-type-assertion -- Minimal mutation double exercises deletion order and failure handling. */
import { AwsClient } from 'aws4fetch'

import type { ActionCtx, MutationCtx } from '../_generated/server'
import { finish, run } from './remove'
import type { Locator } from './table'

test('keeps the locator on storage failure and safely retries missing files', async () => {
  const locator = {
    backend: 'convex',
    path: 'test',
    name: 'one',
    storage_id: 'file',
    codec: 'gzip',
    size: 1,
  } as Locator

  const calls: string[] = []
  let fileExists = true
  let fail = true

  const ctx = {
    db: {
      query: () => ({
        withIndex: () => ({ unique: () => ({ ...locator, _id: 'locator' }) }),
      }),
      system: { get: () => (fileExists ? {} : null) },
      delete: () => {
        calls.push('locator')
      },
    },
    storage: {
      delete: () => {
        calls.push('file')

        if (fail) {
          throw new Error('storage unavailable')
        }
      },
    },
  } as unknown as MutationCtx

  const handler = (
    finish as unknown as {
      _handler: (ctx: MutationCtx, args: { locator: Locator }) => Promise<null>
    }
  )._handler

  await assert.rejects(handler(ctx, { locator }), /storage unavailable/)
  expect(calls).toEqual(['file'])
  fail = false
  calls.length = 0
  await handler(ctx, { locator })
  expect(calls).toEqual(['file', 'locator'])
  fileExists = false
  calls.length = 0
  await handler(ctx, { locator })
  expect(calls).toEqual(['locator'])
})

test('R2 failure preserves the locator; missing R2 bytes allow deletion to finish', async () => {
  const key = process.env.ORCA_R2_ACCESS_KEY_ID
  const secret = process.env.ORCA_R2_SECRET_ACCESS_KEY
  process.env.ORCA_R2_ACCESS_KEY_ID = 'test'
  process.env.ORCA_R2_SECRET_ACCESS_KEY = 'test'

  const request = spyOn(AwsClient.prototype, 'fetch').mockResolvedValue(
    new Response(null, { status: 403 }),
  )

  let removed = false

  const ctx = {
    runQuery: () => ({ backend: 'r2', r2_key: 'test/one' }),
    runMutation: () => {
      removed = true
    },
  } as unknown as ActionCtx

  const handler = (
    run as unknown as {
      _handler: (ctx: ActionCtx, args: { path: string; name: string }) => Promise<null>
    }
  )._handler
  try {
    await assert.rejects(handler(ctx, { path: 'test', name: 'one' }), /R2 DELETE failed: 403/)
    expect(removed).toBe(false)
    request.mockResolvedValue(new Response(null, { status: 404 }))
    await handler(ctx, { path: 'test', name: 'one' })
    expect(removed).toBe(true)
    expect(request.mock.calls[0]?.[1]?.method).toBe('DELETE')
  } finally {
    request.mockRestore()

    if (key === undefined) {
      delete process.env.ORCA_R2_ACCESS_KEY_ID
    } else {
      process.env.ORCA_R2_ACCESS_KEY_ID = key
    }

    if (secret === undefined) {
      delete process.env.ORCA_R2_SECRET_ACCESS_KEY
    } else {
      process.env.ORCA_R2_SECRET_ACCESS_KEY = secret
    }
  }
})
