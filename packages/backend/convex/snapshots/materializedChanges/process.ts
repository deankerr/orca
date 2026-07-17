import type { WithoutSystemFields } from 'convex/server'
import { atomizeChangeset, diff } from 'json-diff-ts'
import type { IAtomicChange, Options as DiffOptions } from 'json-diff-ts'

import type { Doc } from '../../_generated/dataModel'
import type { materializeModelEndpoints } from '../materialize/main'

type MaterializedSnapshot = ReturnType<typeof materializeModelEndpoints>

type ChangeFields = WithoutSystemFields<Doc<'or_views_changes'>>
type ChangeDraft = Omit<ChangeFields, 'crawl_id' | 'previous_crawl_id'>

const DIFF_OPTIONS: DiffOptions = {
  keysToSkip: [
    'updated_at',
    'unavailable_at',

    // model/provider
    'icon_url',
    'or_added_at',

    // endpoint
    'stats',
    'status',
    // denormalised model/provider fields in endpoint doc
    'provider.slug',
    'provider.name',
    'provider.icon_url',
    'provider.model_id',
    'model.name',
    'model.icon_url',
    'model.author_slug',
    'model.author_name',
    'model.or_added_at',
    'model.input_modalities',
    'model.output_modalities',
    'model.reasoning',
  ],
  embeddedObjKeys: {
    // models
    input_modalities: '$value',
    output_modalities: '$value',

    // endpoints
    supported_parameters: '$value',

    // providers
    datacenters: '$value',
  },
  treatTypeChangeAsReplace: false,
}

export function computeMaterializedChanges(args: {
  previous: MaterializedSnapshot
  current: MaterializedSnapshot
  previous_crawl_id: string
  crawl_id: string
}): ChangeFields[] {
  const previousModels = new Map(args.previous.models.map((m) => [m.slug, m]))
  const currentModels = new Map(args.current.models.map((m) => [m.slug, m]))

  const previousEndpoints = new Map(args.previous.endpoints.map((e) => [e.uuid, e]))
  const currentEndpoints = new Map(args.current.endpoints.map((e) => [e.uuid, e]))

  // * exclude models and endpoints affected by fetch errors from both sides
  const allFailedModelKeys = new Set([
    ...args.current.failedModelKeys,
    ...args.previous.failedModelKeys,
  ])
  if (allFailedModelKeys.size > 0) {
    excludeByModelKey(previousModels, allFailedModelKeys, (m) => `${m.version_slug}:${m.variant}`)
    excludeByModelKey(currentModels, allFailedModelKeys, (m) => `${m.version_slug}:${m.variant}`)
    excludeByModelKey(
      previousEndpoints,
      allFailedModelKeys,
      (e) => `${e.model.version_slug}:${e.model.variant}`,
    )
    excludeByModelKey(
      currentEndpoints,
      allFailedModelKeys,
      (e) => `${e.model.version_slug}:${e.model.variant}`,
    )
  }

  const previousProviders = new Map(args.previous.providers.map((p) => [p.slug, p]))
  const currentProviders = new Map(args.current.providers.map((p) => [p.slug, p]))

  const drafts: ChangeDraft[] = [
    ...computeEntityChanges('model', previousModels, currentModels, (m) => ({
      model_slug: m.slug,
    })),
    ...computeEntityChanges('endpoint', previousEndpoints, currentEndpoints, (e) => ({
      model_slug: e.model.slug,
      provider_slug: e.provider.slug,
      provider_tag_slug: e.provider.tag_slug,
      endpoint_uuid: e.uuid,
    })),
    ...computeEntityChanges('provider', previousProviders, currentProviders, (p) => ({
      provider_slug: p.slug,
    })),
  ]

  return drafts.map((change) => ({
    ...change,
    crawl_id: args.crawl_id,
    previous_crawl_id: args.previous_crawl_id,
  })) as ChangeFields[]
}

function computeEntityChanges<T>(
  entityType: 'model' | 'endpoint' | 'provider',
  previousMap: Map<string, T>,
  currentMap: Map<string, T>,
  getIdentifiers: (entity: T) => Record<string, string>,
): ChangeDraft[] {
  const changes: ChangeDraft[] = []

  const keys = new Set([...previousMap.keys(), ...currentMap.keys()].toSorted())

  for (const key of keys) {
    const before = previousMap.get(key)
    const after = currentMap.get(key)

    if (!after) {
      changes.push({
        entity_type: entityType,
        change_kind: 'delete',
        ...getIdentifiers(before!),
      })
      continue
    }

    if (!before) {
      changes.push({
        entity_type: entityType,
        change_kind: 'create',
        ...getIdentifiers(after),
      })
      continue
    }

    const identifiers = getIdentifiers(before)
    const diffItems = processDiff(before, after)

    for (const item of diffItems) {
      changes.push({
        ...identifiers,
        ...item,
        entity_type: entityType,
        change_kind: 'update',
      })
    }
  }

  return changes
}

type ProcessedDiffItem = {
  path?: string
  path_level_1?: string
  path_level_2?: string
  before: unknown
  after: unknown
}

function processDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): ProcessedDiffItem[] {
  const changeset = diff(before, after, DIFF_OPTIONS)
  const atomicChanges = atomizeChangeset(changeset)

  // * group atomic changes by base path
  const grouped = new Map<string, IAtomicChange[]>()

  for (const change of atomicChanges) {
    // "$.supported_parameters[?(@=='tools')]" -> "supported_parameters"
    // "$.data_policy.retains_prompts" -> "data_policy.retains_prompts"
    const basePath = change.path.replace(/^\$\./, '').replace(/\[.*/, '')

    if (!grouped.has(basePath)) {
      grouped.set(basePath, [])
    }
    grouped.get(basePath)!.push(change)
  }

  const items: ProcessedDiffItem[] = []

  // * process grouped changes
  for (const [basePath, changes] of grouped) {
    const segments = basePath.split('.')
    const isArrayChange = changes.some((c) => c.path.includes('['))

    if (isArrayChange) {
      // array: get full before/after arrays from source objects
      const beforeValue = getValueByPath(before, segments)
      const afterValue = getValueByPath(after, segments)

      items.push({
        path: basePath,
        path_level_1: segments[0],
        path_level_2: segments[1],
        before: beforeValue,
        after: afterValue,
      })
    } else {
      // non-array: use atomic change values directly
      // note: ADD has oldValue=undefined, REMOVE has value=undefined
      const [change] = changes

      items.push({
        path: basePath,
        path_level_1: segments[0],
        path_level_2: segments[1],
        before: change.oldValue,
        after: change.value,
      })
    }
  }

  return items
}

function getValueByPath(obj: Record<string, any>, segments: string[]): unknown {
  let current: any = obj
  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = current[segment]
  }
  return current
}

/** Remove entities matching failed model keys from a map so they're excluded from diffing. */
function excludeByModelKey<T>(
  map: Map<string, T>,
  failedModelKeys: Set<string>,
  getModelKey: (entity: T) => string,
) {
  for (const [key, entity] of map) {
    if (failedModelKeys.has(getModelKey(entity))) {
      map.delete(key)
    }
  }
}
