import * as Data from 'effect/Data'

export class ProjectionStoreError extends Data.TaggedError('ProjectionStoreError')<{
  readonly cause: unknown
  readonly operation: 'activate' | 'cleanup' | 'read' | 'stage'
}> {}
