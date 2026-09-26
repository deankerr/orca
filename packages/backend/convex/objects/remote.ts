import { ConvexError, v } from 'convex/values'

import { action, env, query } from '../_generated/server'
import {
  assertReadCount,
  findLocalNames,
  nameSelection,
  objectIdentity,
  readLocal,
  storedBatch,
} from './local'

function requireApiKey(apiKey: string): void {
  const expected = env.ORCA_OBJECTS_API_KEY
  if (expected === undefined || expected === '' || apiKey !== expected) {
    throw new ConvexError('Unauthorized object source request')
  }
}

/** Authenticated discovery always serves this deployment, regardless of its own source override. */
export const namesAtOrAfter = query({
  args: { apiKey: v.string(), ...nameSelection.fields },
  returns: v.array(v.string()),
  handler: async (ctx, { apiKey, ...selection }) => {
    requireApiKey(apiKey)
    return await findLocalNames(ctx, selection)
  },
})

/** One-hop batch transfer: read local bytes in parallel, without decoding or following redirects. */
export const loadMany = action({
  args: { apiKey: v.string(), objects: v.array(objectIdentity) },
  returns: storedBatch,
  handler: async (ctx, { apiKey, objects }) => {
    requireApiKey(apiKey)
    assertReadCount(objects.length)
    return await Promise.all(objects.map(async (identity) => await readLocal(ctx, identity)))
  },
})
