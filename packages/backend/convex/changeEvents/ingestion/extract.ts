import type { Infer } from 'convex/values'
import { diff } from 'json-diff-ts'

import type { Metadata, ScanComparison, ScanProjection } from '../../projections'
import { INITIAL_SCAN_ARTIFACT_ID } from '../../v3/ingestions.table'
import { ChangeEventInputContent } from '../schema'
import type { entityChangeFields } from '../schema'

type Collection = keyof ScanProjection['catalog']

/**
 * One natural responsibility per input. Lifecycle takes precedence over field updates; pricing and
 * other updates can proceed independently while retaining the same historical entity context.
 * @yields {Infer<typeof entityChangeFields>} An indivisible assignment and its evidence.
 */
export function* extractChangeEventInputs(
  comparison: ScanComparison,
): Generator<Infer<typeof entityChangeFields>> {
  for (const [collection, entity_kind] of [
    ['models', 'model'],
    ['providers', 'provider'],
    ['endpoints', 'endpoint'],
  ] as const) {
    // Select changed entities from the shared comparison; unchanged entities produce no input.
    const group = comparison.document.changes.find((change) => change.key === collection)
    for (const change of group?.changes ?? []) {
      const entity_id = change.key
      const before = comparison.previous.catalog[collection][entity_id] ?? null
      const after = comparison.next.catalog[collection][entity_id] ?? null

      // Capture both historical contexts before splitting the entity's processing responsibilities.
      const evidence = {
        before: captureEntityContext(comparison.previous.catalog, collection, entity_id),
        after: captureEntityContext(comparison.next.catalog, collection, entity_id),
      }

      const identity = {
        from_scan_at:
          comparison.previous.id === INITIAL_SCAN_ARTIFACT_ID ? null : comparison.previous.scan_at,
        scan_at: comparison.next.scan_at,
        entity_kind,
        entity_id,
      }

      // Lifecycle: assign the whole appearance or disappearance instead of individual field changes.
      if (before === null || after === null) {
        yield {
          ...identity,
          category: 'lifecycle',
          content: JSON.stringify(
            ChangeEventInputContent.parse({ assigned: { before, after }, context: evidence }),
          ),
        }
        continue
      }

      // Field updates: partition pricing from attributes so either can be deferred independently.
      // Assign whole changed top-level fields, retaining nested values for later interpretation.
      const keys = diff(before, after, { treatTypeChangeAsReplace: false }).map(
        (field) => field.key,
      )
      for (const category of ['pricing', 'attributes'] as const) {
        const assigned = keys.filter((key) => (key === 'pricing') === (category === 'pricing'))

        if (assigned.length === 0) {
          continue
        }
        // Keep an absent field absent on that side; absence and an explicit null are distinct changes.
        const pick = (record: Metadata) =>
          Object.fromEntries(
            assigned.filter((key) => Object.hasOwn(record, key)).map((key) => [key, record[key]]),
          )

        yield {
          ...identity,
          category,
          content: JSON.stringify(
            ChangeEventInputContent.parse({
              assigned: { before: pick(before), after: pick(after) },
              context: evidence,
            }),
          ),
        }
      }
    }
  }
}

/** Capture related records from the same observation; absent endpoints have no related context. */
function captureEntityContext(
  catalog: ScanProjection['catalog'],
  collection: Collection,
  id: string,
) {
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
