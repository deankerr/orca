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

export const ingestResult = v.union(
  v.object({
    kind: commitResult,
    process: v.string(),
  }),
  v.object({
    error,
    kind: v.literal('failed'),
    process: v.string(),
    stage: literals('prepare', 'write'),
  }),
)

export const removalResult = v.union(
  v.object({
    kind: removeResult,
    process: v.string(),
  }),
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
export type RemovalResult = Infer<typeof removalResult>
