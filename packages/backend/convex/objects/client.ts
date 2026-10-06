import { validate } from 'convex-helpers/validators'
import { ConvexHttpClient } from 'convex/browser'
import { ConvexError } from 'convex/values'

import { api } from '#generated/api'

import { assertReadCount, decode, storedBatch, validateNames } from './protocol'
import type { NameSelection, ObjectIdentity, ObjectReader } from './protocol'

/** Read logical objects from an explicit source, without a deployment or local storage. */
export function connect({
  deployment,
  apiKey,
}: {
  deployment: string
  apiKey: string
}): ObjectReader {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(deployment)) {
    throw new ConvexError('Object source must be a deployment name, not a URL')
  }

  if (apiKey.length === 0) {
    throw new ConvexError('ORCA_OBJECTS_API_KEY is required for remote object reads')
  }

  const client = new ConvexHttpClient(`https://${deployment}.convex.cloud`)

  return {
    async loadMany(identities: ObjectIdentity[]): Promise<(string | null)[]> {
      assertReadCount(identities.length)

      const stored: unknown = await client.action(api.objects.remote.loadMany, {
        apiKey,
        objects: identities,
      })

      if (!validate(storedBatch, stored) || stored.length !== identities.length) {
        throw new ConvexError('Object source returned an invalid batch')
      }

      return stored.map(decode)
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
