import { validate } from 'convex-helpers/validators'
import { ConvexHttpClient } from 'convex/browser'

import { api } from '../_generated/api'
import type { ObjectIdentity } from './index'
import { assertReadCount, decode, storedBatch, validateNames } from './local'
import type { NameSelection } from './local'

/** Read logical objects from an explicit source, without a deployment or local storage. */
export function createObjectReader(deployment: string, apiKey: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(deployment)) {
    throw new Error('Use a Convex deployment name for the object source, not a URL.')
  }

  if (apiKey.length === 0) {
    throw new Error('Set ORCA_OBJECTS_API_KEY to the source deployment’s object read key.')
  }

  const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`)

  return {
    async load(identity: ObjectIdentity): Promise<string | null> {
      const stored: unknown = await client.action(api.objects.remote.loadMany, {
        apiKey,
        objects: [identity],
      })

      if (!validate(storedBatch, stored) || stored.length !== 1) {
        throw new Error('Object source returned an invalid batch.')
      }

      return decode(stored[0] ?? null)
    },
    async namesAtOrAfter(selection: NameSelection): Promise<string[]> {
      assertReadCount(selection.limit)
      return validateNames(
        await client.query(api.objects.remote.namesAtOrAfter, { apiKey, ...selection }),
        selection,
      )
    },
  }
}
