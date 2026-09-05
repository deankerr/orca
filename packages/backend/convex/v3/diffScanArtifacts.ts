import { v } from 'convex/values'
import { diff } from 'json-diff-ts'
import type { Options as DiffOptions } from 'json-diff-ts'
import * as R from 'remeda'

import { internalAction } from '../_generated/server'
import { loadScanArtifact } from '../scan/artifact'
import type { ScanArtifact } from '../scan/artifact'

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
    const [from, to] = await Promise.all([
      loadScanArtifact(ctx, args.fromId),
      loadScanArtifact(ctx, args.toId),
    ])

    return diff({ data: toDiffEntries(from) }, { data: toDiffEntries(to) }, DIFF_OPTIONS)
  },
})

function toDiffEntries(artifact: ScanArtifact) {
  return artifact.entries
    .map((entry) => R.omit(entry, ['scan_at']))
    .filter(
      (entry) =>
        entry.model.input_modalities.includes('text') &&
        entry.model.output_modalities.includes('text'),
    )
}
