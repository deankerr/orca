// * Pure: which catalog models become queue work for a batch.
import type { BatchId, EndpointsQuery } from '@orca/schema/artifacts.ts'
import { EndpointsQuery as EndpointsQuerySchema } from '@orca/schema/artifacts.ts'
import type { CatalogModel } from '@orca/schema/openrouter.ts'
import * as Schema from 'effect/Schema'

const decodeQuery = Schema.decodeUnknownSync(EndpointsQuerySchema)

/** Models with nothing serving them, and `~` aliases of another listed model. */
export const isCrawlable = (model: CatalogModel): boolean =>
  model.endpoint !== null && !model.slug.startsWith('~')

/**
 * Build the endpoints queries for one crawl. Decode failures throw (catalog strings that cannot
 * become archive ids are a planning defect).
 */
export const workList = (batch: BatchId, models: ReadonlyArray<CatalogModel>): EndpointsQuery[] => {
  const queries: EndpointsQuery[] = []
  for (const model of models) {
    if (model.endpoint === null || model.slug.startsWith('~')) {
      continue
    }
    queries.push(
      decodeQuery({
        batch,
        permaslug: model.permaslug,
        variant: model.endpoint.variant,
      }),
    )
  }
  return queries
}
