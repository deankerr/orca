import { ConvexError, v } from 'convex/values'
import { diff } from 'json-diff-ts'
import type { Options as DiffOptions } from 'json-diff-ts'
import * as R from 'remeda'

import { internalAction } from '../_generated/server'
import { load } from '../objects'
import { parseScanArtifact } from '../scan/artifact'
import { SCAN_ARTIFACT_OBJECT_PATH } from '../scan/schema'

const DIFF_OPTIONS: DiffOptions = {
  keysToSkip: ['data.endpoints.stats'],
  embeddedObjKeys: {
    data: 'model_id',
    'data.endpoints': 'id',
  },
}

export const run = internalAction({
  args: {
    fromId: v.string(),
    toId: v.string(),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const [fromText, toText] = await Promise.all([
      load(ctx, { path: SCAN_ARTIFACT_OBJECT_PATH, name: args.fromId }),
      load(ctx, { path: SCAN_ARTIFACT_OBJECT_PATH, name: args.toId }),
    ])

    if (fromText === null) {
      throw new ConvexError({
        message: 'scan artifact not found',
        id: args.fromId,
      })
    }

    if (toText === null) {
      throw new ConvexError({
        message: 'scan artifact not found',
        id: args.toId,
      })
    }

    return diff({ data: toDiffEntries(fromText) }, { data: toDiffEntries(toText) }, DIFF_OPTIONS)
  },
})

function toDiffEntries(text: string) {
  return parseScanArtifact(text)
    .map((entry) => R.omit(entry, ['scan_at']))
    .filter(
      (entry) =>
        entry.model.input_modalities.includes('text') &&
        entry.model.output_modalities.includes('text'),
    )
}
