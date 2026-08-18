import * as Data from 'effect/Data'

export class ObservationArchiveError extends Data.TaggedError('ObservationArchiveError')<{
  readonly reason: 'not-found' | 'storage'
  readonly operation: 'read' | 'write'
  readonly key: string
  readonly cause?: unknown
}> {}
