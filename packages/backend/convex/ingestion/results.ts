import { literals } from 'convex-helpers/validators'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const commitResult = literals('committed', 'already_committed')
export const removeResult = literals('removed', 'already_removed')

const error = v.object({
  message: v.string(),
  name: v.string(),
  stack: v.optional(v.string()),
})

/** What an action returns: `succeeded` throws before any failed result escapes. */
export const ingestSuccess = v.object({ kind: commitResult, process: v.string() })
export const removalSuccess = v.object({ kind: removeResult, process: v.string() })

export const ingestResult = v.union(
  ingestSuccess,
  v.object({
    error,
    kind: v.literal('failed'),
    process: v.string(),
    stage: literals('prepare', 'write'),
  }),
)

export const removalResult = v.union(
  removalSuccess,
  v.object({
    error,
    kind: v.literal('failed'),
    process: v.string(),
    stage: v.literal('remove'),
  }),
)

export type CommitResult = Infer<typeof commitResult>

export type RemoveResult = Infer<typeof removeResult>

export type IngestResult = Infer<typeof ingestResult>

export type IngestSuccess = Infer<typeof ingestSuccess>

export type RemovalSuccess = Infer<typeof removalSuccess>

export type RemovalResult = Infer<typeof removalResult>
