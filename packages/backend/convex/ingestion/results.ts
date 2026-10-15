import { literals } from 'convex-helpers/validators'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

export const commitResult = literals('committed', 'already_committed')
export const removeResult = literals('removed', 'already_removed')

const error = v.object({
  name: v.string(),
  message: v.string(),
  stack: v.optional(v.string()),
})

export const ingestResult = v.union(
  v.object({
    process: v.string(),
    kind: commitResult,
  }),
  v.object({
    process: v.string(),
    kind: v.literal('failed'),
    stage: literals('prepare', 'write'),
    error,
  }),
)

export const removalResult = v.union(
  v.object({
    process: v.string(),
    kind: v.union(removeResult, v.literal('unsupported')),
  }),
  v.object({
    process: v.string(),
    kind: v.literal('failed'),
    stage: v.literal('remove'),
    error,
  }),
)

export type CommitResult = Infer<typeof commitResult>
export type RemoveResult = Infer<typeof removeResult>
export type IngestResult = Infer<typeof ingestResult>
export type RemovalResult = Infer<typeof removalResult>
