import type { Infer } from 'convex/values'
import { diff } from 'json-diff-ts'

import type { Metadata, ScanComparison, ScanProjection } from '../../../projections'
import { JobContent } from '../entityChange'
import type { jobFields } from '../entityChange'

type Collection = keyof ScanProjection['catalog']

function context(catalog: ScanProjection['catalog'], collection: Collection, id: string) {
  const entity = catalog[collection][id] ?? null
  const endpoint = collection === 'endpoints' ? catalog.endpoints[id] : undefined
  return endpoint === undefined
    ? { entity }
    : {
        entity,
        model: catalog.models[endpoint.model_id] ?? null,
        provider: catalog.providers[endpoint.provider_id] ?? null,
      }
}

/** One natural responsibility per job. Lifecycle takes precedence over field updates; pricing and
 * other updates can proceed independently while retaining the same historical entity context.
 * @yields {Infer<typeof jobFields>} One indivisible job with assigned changes and supporting evidence.
 */
export function* prepare(comparison: ScanComparison): Generator<Infer<typeof jobFields>> {
  for (const collection of ['models', 'providers', 'endpoints'] as const) {
    const group = comparison.document.changes.find((change) => change.key === collection)
    for (const change of group?.changes ?? []) {
      const entity_id = change.key
      const before = comparison.previous.catalog[collection][entity_id] ?? null
      const after = comparison.next.catalog[collection][entity_id] ?? null
      const evidence = {
        before: context(comparison.previous.catalog, collection, entity_id),
        after: context(comparison.next.catalog, collection, entity_id),
      }
      const identity = {
        from_scan_at: comparison.previous.scan_at,
        scan_at: comparison.next.scan_at,
        collection,
        entity_id,
      }
      if (before === null || after === null) {
        yield {
          ...identity,
          category: 'lifecycle',
          content: JSON.stringify(
            JobContent.parse({ changes: { before, after }, context: evidence }),
          ),
        }
        continue
      }
      // Only changed top-level fields belong to the assignment. Nested evidence stays intact;
      // processing and presentation can inspect the exact changes within those fields.
      const keys = diff(before, after, { treatTypeChangeAsReplace: false }).map(
        (field) => field.key,
      )
      for (const category of ['pricing', 'update'] as const) {
        const assigned = keys.filter((key) => (key === 'pricing') === (category === 'pricing'))
        if (assigned.length === 0) {
          continue
        }
        const pick = (record: Metadata) =>
          Object.fromEntries(
            assigned.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]),
          )
        yield {
          ...identity,
          category,
          content: JSON.stringify(
            JobContent.parse({
              changes: { before: pick(before), after: pick(after) },
              context: evidence,
            }),
          ),
        }
      }
    }
  }
}
