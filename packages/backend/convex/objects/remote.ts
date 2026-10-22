import { ConvexError, v } from 'convex/values'

import { action, env, query } from '#generated/server'

import { findLocalNames, readLocal } from './local'
import { assertReadCount, nameSelection, objectIdentity, storedBatch } from './protocol'

function requireApiKey(apiKey: string): void {
  const expected = env.ORCA_OBJECTS_API_KEY
  if (expected === undefined || expected === '' || apiKey !== expected) {
    throw new ConvexError('Unauthorized object source request')
  }
}

/** Authenticated discovery always serves this deployment, regardless of its own source override. */
export const namesAtOrAfter = query({
  args: { apiKey: v.string(), ...nameSelection.fields },
  handler: async (ctx, { apiKey, ...selection }) => {
    requireApiKey(apiKey)
    return await findLocalNames(ctx, selection)
  },
  returns: v.array(v.string()),
})

/** One-hop batch transfer: read local bytes in parallel, without decoding or following redirects. */
export const loadMany = action({
  args: { apiKey: v.string(), objects: v.array(objectIdentity) },
  handler: async (ctx, { apiKey, objects }) => {
    requireApiKey(apiKey)
    assertReadCount(objects.length)
    return await Promise.all(objects.map(async (identity) => await readLocal(ctx, identity)))
  },
  returns: storedBatch,
})
