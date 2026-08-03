import type { JsonRecord } from '../transform/json.ts'

export type CompressionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type DropReason =
  | 'empty-catalog'
  | 'failed-text-endpoint-scope'
  | 'malformed-bundle'
  | 'no-text-endpoints'

export interface CleanBundle {
  readonly crawl_id: string
  readonly data: {
    readonly models: readonly CleanScope[]
  }
}

export interface CleanScope {
  readonly endpoints: readonly JsonRecord[]
  readonly model: JsonRecord
}

export type CleanResult =
  | {
      readonly _tag: 'Accepted'
      readonly bundle: CleanBundle
      readonly endpoints: number
      readonly modelScopes: number
    }
  | { readonly _tag: 'Dropped'; readonly crawlId: string; readonly reason: DropReason }

/** Structurally stable corpus record. Endpoint model copies are deduplicated by model slug. */
export interface CorpusCrawl {
  readonly crawlId: string
  readonly endpoints: readonly CorpusEndpoint[]
  readonly models: readonly JsonRecord[]
}

export interface CorpusEndpoint {
  readonly data: JsonRecord
  readonly modelSlug: string
}
