import { diff } from 'json-diff-ts'
import type { IChange, Options as DiffOptions } from 'json-diff-ts'

import type { Catalog, SourceEndpoint, SourceModel } from './explode'

export type MapChange<T> =
  | { id: string; kind: 'create'; next: T }
  | { id: string; kind: 'absent' }
  | { id: string; kind: 'update'; next: T; changeset: IChange[] }

export type Diff = {
  models: MapChange<SourceModel>[]
  endpoints: MapChange<SourceEndpoint>[]
}

const MODEL_DIFF: DiffOptions = {
  // OpenRouter `updated_at` moves without a meaningful model change
  keysToSkip: ['updated_at'],
  embeddedObjKeys: {
    input_modalities: '$value',
    output_modalities: '$value',
  },
  treatTypeChangeAsReplace: false,
}

const ENDPOINT_DIFF: DiffOptions = {
  // sampled onto the stats series from `after` every scan
  keysToSkip: ['stats', 'statsByTier'],
  // status, capacity_tpm: optional noisy skips; left on so they still upsert the view
  embeddedObjKeys: {
    supported_parameters: '$value',
    excluded_parameters: '$value',
  },
  treatTypeChangeAsReplace: false,
}

/**
 * Diff two catalogs by id. Skip lists avoid view writes; they do not drop fields
 * from the artifact.
 */
export function compare(before: Catalog, after: Catalog): Diff {
  return {
    models: compareMaps(before.models, after.models, MODEL_DIFF),
    endpoints: compareMaps(before.endpoints, after.endpoints, ENDPOINT_DIFF),
  }
}

export function compareMaps<T>(
  before: Map<string, T>,
  after: Map<string, T>,
  options?: DiffOptions,
): MapChange<T>[] {
  const changes: MapChange<T>[] = []
  const ids = [...new Set([...before.keys(), ...after.keys()])].toSorted()

  for (const id of ids) {
    const prev = before.get(id)
    const next = after.get(id)

    if (prev !== undefined && next === undefined) {
      changes.push({ id, kind: 'absent' })
      continue
    }

    if (prev === undefined && next !== undefined) {
      changes.push({ id, kind: 'create', next })
      continue
    }

    if (prev === undefined || next === undefined) {
      continue
    }

    const changeset = diff(prev, next, options) ?? []
    if (changeset.length === 0) {
      continue
    }

    changes.push({ id, kind: 'update', next, changeset })
  }

  return changes
}
