import { ConvexError, v } from 'convex/values'

import { action, env, query } from '#generated/server'

import { findLocalNames, readLocal } from './local'
import { assertReadCount, nameSelection, objectIdentity, storedBatch } from './protocol'

function requireApiKey(apiKey: string): void {
  const expected = env.ORCA_OBJECTS_API_KEY
  if (expected === undefined || expected === '' || !sameKey(apiKey, expected)) {
    throw new ConvexError('Unauthorized object source request')
  }
}

/** Compare without an early exit on the first differing byte; the length is not secret enough to hide. */
function sameKey(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a)
  const right = new TextEncoder().encode(b)
  // oxlint-disable-next-line no-bitwise -- XOR accumulation keeps the comparison constant-time.
  let diff = left.length ^ right.length

  for (const [index, byte] of left.entries()) {
    // oxlint-disable-next-line no-bitwise -- XOR accumulation keeps the comparison constant-time.
    diff |= byte ^ (right[index] ?? 0)
  }
  return diff === 0
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
