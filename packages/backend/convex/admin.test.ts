/* oxlint-disable typescript/no-unsafe-type-assertion -- Minimal auth contexts exercise the registered query handlers without a deployment. */
import { afterEach, expect, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { UserIdentity } from 'convex/server'

import type { QueryCtx } from './_generated/server'
import { demo, viewer } from './admin'

const originalAdmin = process.env.ORCA_ADMIN_USER_ID

afterEach(() => {
  if (originalAdmin === undefined) {
    delete process.env.ORCA_ADMIN_USER_ID
  } else {
    process.env.ORCA_ADMIN_USER_ID = originalAdmin
  }
})

const demoHandler = (
  demo as unknown as {
    _handler: (ctx: QueryCtx, args: object) => Promise<{ userId: string; message: string }>
  }
)._handler
const viewerHandler = (
  viewer as unknown as {
    _handler: (ctx: QueryCtx, args: object) => Promise<{ userId: string | null; isAdmin: boolean }>
  }
)._handler

function context(subject: string | null): QueryCtx {
  const identity: UserIdentity | null =
    subject === null
      ? null
      : { subject, issuer: 'https://issuer.example', tokenIdentifier: `test|${subject}` }

  return { auth: { getUserIdentity: async () => identity } } as unknown as QueryCtx
}

test('anonymous and other signed-in users cannot call the admin demo directly', async () => {
  process.env.ORCA_ADMIN_USER_ID = 'user_admin'

  for (const subject of [null, 'user_other']) {
    await rejects(demoHandler(context(subject), {}), /Administrator access required/)
    expect(await viewerHandler(context(subject), {})).toEqual({ userId: subject, isAdmin: false })
  }
})

test('an unset or empty allowlist denies authenticated callers', async () => {
  delete process.env.ORCA_ADMIN_USER_ID
  await rejects(demoHandler(context('user_admin'), {}), /Administrator access required/)

  process.env.ORCA_ADMIN_USER_ID = ''
  await rejects(demoHandler(context('user_admin'), {}), /Administrator access required/)
})

test('only the configured identity can call the demo; replacing it revokes the old identity', async () => {
  process.env.ORCA_ADMIN_USER_ID = 'user_admin'
  expect(await demoHandler(context('user_admin'), {})).toEqual({
    userId: 'user_admin',
    message: 'Administrator access verified',
  })
  expect(await viewerHandler(context('user_admin'), {})).toEqual({
    userId: 'user_admin',
    isAdmin: true,
  })

  process.env.ORCA_ADMIN_USER_ID = 'user_replacement'
  await rejects(demoHandler(context('user_admin'), {}), /Administrator access required/)
  expect(await demoHandler(context('user_replacement'), {})).toMatchObject({
    userId: 'user_replacement',
  })
})
