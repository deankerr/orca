import * as Data from 'effect/Data'

export class OpenRouterClientError extends Data.TaggedError('OpenRouterClientError')<{
  readonly cause: unknown
  readonly operation: 'catalog' | 'endpoints' | 'normalize'
  readonly scope?: string
}> {}
