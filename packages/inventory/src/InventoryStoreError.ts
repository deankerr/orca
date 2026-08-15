import * as Data from 'effect/Data'

export class InventoryStoreError extends Data.TaggedError('InventoryStoreError')<{
  readonly cause: unknown
  readonly operation:
    | 'compress-archive'
    | 'decode-current'
    | 'encode'
    | 'read-current'
    | 'write-archive'
    | 'write-current'
}> {}
