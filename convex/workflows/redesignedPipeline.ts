/**
 * Redesigned Snapshot Pipeline
 *
 * A cleaner architecture that:
 * 1. Stores pre-flattened view-format data in archives
 * 2. Combines materialization and change detection into one step
 * 3. Produces changes atomically during upsert
 *
 * KEY INSIGHT: Both materialization and change detection need to compare
 * "previous state" with "current state". By storing archives in view format,
 * we can:
 * - Compare archives directly (no transformation needed during comparison)
 * - Skip querying current DB state (previous archive has it)
 * - Produce changes as a byproduct of the comparison
 *
 * NEW ARCHIVE FORMAT (View-Centric):
 * ```
 * {
 *   crawl_id: string
 *   models: ModelView[]      // Pre-flattened
 *   endpoints: EndpointView[] // Pre-flattened
 *   providers: ProviderView[] // Pre-flattened
 *   sources?: {...}          // Optional raw artifacts
 * }
 * ```
 *
 * PIPELINE FLOW:
 * ```
 * [Crawl + Transform] → Fetch raw API data, immediately transform to view format
 *     ↓
 * [Store Archive] → Gzip and store view-format bundle
 *     ↓
 * [Materialize + Changes] → Single step that:
 *     1. Loads previous archive (already view-format)
 *     2. Compares with new archive → produces changes
 *     3. Upserts views + inserts changes atomically
 *     ↓
 * [Alerts]
 * ```
 */
import { type Infer, v } from 'convex/values'

import { atomizeChangeset, diff, type Options as DiffOptions } from 'json-diff-ts'

import { db } from '../db'
import type { Doc } from '../_generated/dataModel'

// ============================================================================
// VIEW-CENTRIC ARCHIVE TYPES
// ============================================================================

/**
 * Model view data (matches or_views_models schema, minus system fields)
 */
export type ModelViewData = Omit<
  Infer<typeof db.or.views.models.vTable.validator>,
  'updated_at' | '_id' | '_creationTime'
>

/**
 * Endpoint view data (matches or_views_endpoints schema, minus system fields)
 */
export type EndpointViewData = Omit<
  Infer<typeof db.or.views.endpoints.vTable.validator>,
  'updated_at' | '_id' | '_creationTime'
>

/**
 * Provider view data (matches or_views_providers schema, minus system fields)
 */
export type ProviderViewData = Omit<
  Infer<typeof db.or.views.providers.vTable.validator>,
  'updated_at' | '_id' | '_creationTime'
>

/**
 * Raw source artifacts for debugging/recovery
 */
export type SourcesBundle = {
  models: Array<{ key: string; data: Record<string, unknown> }>
  endpoints: Array<{ key: string; data: Record<string, unknown> }>
  providers: Array<{ key: string; data: Record<string, unknown> }>
}

/**
 * View-Centric Archive Bundle
 *
 * Stores pre-flattened data that matches view table schemas directly.
 * This eliminates the transformation step during materialization and
 * enables direct archive-to-archive comparison for change detection.
 */
export type ViewArchiveBundle = {
  crawl_id: string
  version: 2 // Archive format version

  // Pre-flattened view data
  models: ModelViewData[]
  endpoints: EndpointViewData[]
  providers: ProviderViewData[]

  // Optional: raw API artifacts for debugging/recovery
  sources?: SourcesBundle

  // Metadata
  meta: {
    fetched_at: number
    totals: {
      models: number
      endpoints: number
      providers: number
    }
  }
}

// ============================================================================
// CHANGE TYPES
// ============================================================================

export type EntityType = 'model' | 'endpoint' | 'provider'
export type ChangeKind = 'create' | 'update' | 'delete'

/**
 * A detected change between two archives
 */
export type ChangeRecord = {
  entity_type: EntityType
  change_kind: ChangeKind

  // Entity identifiers (varies by type)
  model_slug?: string
  endpoint_uuid?: string
  provider_slug?: string
  provider_tag_slug?: string

  // For updates: field-level details
  path?: string
  path_level_1?: string
  path_level_2?: string
  before?: unknown
  after?: unknown

  // Context
  crawl_id: string
  previous_crawl_id: string
}

// ============================================================================
// COMPARISON ENGINE
// ============================================================================

const DIFF_OPTIONS: DiffOptions = {
  keysToSkip: [
    'updated_at',
    'unavailable_at',

    // model/provider display fields
    'icon_url',
    'or_added_at',

    // endpoint runtime data
    'stats',
    'status',

    // denormalized fields in endpoint.model
    'model.name',
    'model.icon_url',
    'model.author_slug',
    'model.author_name',
    'model.or_added_at',
    'model.input_modalities',
    'model.output_modalities',
    'model.reasoning',

    // denormalized fields in endpoint.provider
    'provider.slug',
    'provider.name',
    'provider.icon_url',
    'provider.model_id',
  ],
  embeddedObjKeys: {
    input_modalities: '$value',
    output_modalities: '$value',
    supported_parameters: '$value',
    datacenters: '$value',
  },
  treatTypeChangeAsReplace: false,
}

/**
 * Compare two view-format archives and produce changes
 *
 * This is the core of the redesigned pipeline - a pure function that takes
 * two archives and outputs a list of changes.
 */
export function compareArchives(args: {
  previous: ViewArchiveBundle
  current: ViewArchiveBundle
}): ChangeRecord[] {
  const { previous, current } = args

  const changes: ChangeRecord[] = []

  // Compare models
  const modelChanges = compareEntities({
    entityType: 'model',
    previous: new Map(previous.models.map((m) => [m.slug, m])),
    current: new Map(current.models.map((m) => [m.slug, m])),
    getIdentifiers: (m) => ({ model_slug: m.slug }),
    crawl_id: current.crawl_id,
    previous_crawl_id: previous.crawl_id,
  })
  changes.push(...modelChanges)

  // Compare endpoints
  const endpointChanges = compareEntities({
    entityType: 'endpoint',
    previous: new Map(previous.endpoints.map((e) => [e.uuid, e])),
    current: new Map(current.endpoints.map((e) => [e.uuid, e])),
    getIdentifiers: (e) => ({
      model_slug: e.model.slug,
      endpoint_uuid: e.uuid,
      provider_slug: e.provider.slug,
      provider_tag_slug: e.provider.tag_slug,
    }),
    crawl_id: current.crawl_id,
    previous_crawl_id: previous.crawl_id,
  })
  changes.push(...endpointChanges)

  // Compare providers
  const providerChanges = compareEntities({
    entityType: 'provider',
    previous: new Map(previous.providers.map((p) => [p.slug, p])),
    current: new Map(current.providers.map((p) => [p.slug, p])),
    getIdentifiers: (p) => ({ provider_slug: p.slug }),
    crawl_id: current.crawl_id,
    previous_crawl_id: previous.crawl_id,
  })
  changes.push(...providerChanges)

  return changes
}

/**
 * Compare two maps of entities and produce changes
 */
function compareEntities<T>(args: {
  entityType: EntityType
  previous: Map<string, T>
  current: Map<string, T>
  getIdentifiers: (entity: T) => Record<string, string>
  crawl_id: string
  previous_crawl_id: string
}): ChangeRecord[] {
  const { entityType, previous, current, getIdentifiers, crawl_id, previous_crawl_id } = args
  const changes: ChangeRecord[] = []

  const allKeys = new Set([...previous.keys(), ...current.keys()])

  for (const key of allKeys) {
    const before = previous.get(key)
    const after = current.get(key)

    if (!after && before) {
      // Deleted
      changes.push({
        entity_type: entityType,
        change_kind: 'delete',
        ...getIdentifiers(before),
        crawl_id,
        previous_crawl_id,
      })
      continue
    }

    if (!before && after) {
      // Created
      changes.push({
        entity_type: entityType,
        change_kind: 'create',
        ...getIdentifiers(after),
        crawl_id,
        previous_crawl_id,
      })
      continue
    }

    if (before && after) {
      // Possibly updated - compute field-level diffs
      const fieldChanges = computeFieldChanges(before as any, after as any)

      for (const fieldChange of fieldChanges) {
        changes.push({
          entity_type: entityType,
          change_kind: 'update',
          ...getIdentifiers(before),
          ...fieldChange,
          crawl_id,
          previous_crawl_id,
        })
      }
    }
  }

  return changes
}

/**
 * Compute field-level changes between two objects
 */
function computeFieldChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Array<{ path: string; path_level_1: string; path_level_2?: string; before: unknown; after: unknown }> {
  const changeset = diff(before, after, DIFF_OPTIONS)
  const atomicChanges = atomizeChangeset(changeset)

  // Group by base path
  const grouped = new Map<string, typeof atomicChanges>()
  for (const change of atomicChanges) {
    const basePath = change.path.replace(/^\$\./, '').replace(/\[.*/, '')
    if (!grouped.has(basePath)) {
      grouped.set(basePath, [])
    }
    grouped.get(basePath)!.push(change)
  }

  const results: Array<{ path: string; path_level_1: string; path_level_2?: string; before: unknown; after: unknown }> = []

  for (const [basePath, changes] of grouped) {
    const segments = basePath.split('.')
    const isArrayChange = changes.some((c) => c.path.includes('['))

    if (isArrayChange) {
      // For arrays, get full before/after values
      const beforeValue = getNestedValue(before, segments)
      const afterValue = getNestedValue(after, segments)

      results.push({
        path: basePath,
        path_level_1: segments[0]!,
        path_level_2: segments[1],
        before: beforeValue,
        after: afterValue,
      })
    } else {
      // For scalars, use atomic change values
      const change = changes[0]!
      results.push({
        path: basePath,
        path_level_1: segments[0]!,
        path_level_2: segments[1],
        before: change.oldValue,
        after: change.value,
      })
    }
  }

  return results
}

function getNestedValue(obj: Record<string, unknown>, segments: string[]): unknown {
  let current: unknown = obj
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}

// ============================================================================
// MATERIALIZATION RESULT TYPES
// ============================================================================

/**
 * Result of the combined materialize + changes step
 */
export type MaterializeWithChangesResult = {
  crawl_id: string
  previous_crawl_id: string | null

  // Upsert counts
  models: { stable: number; updated: number; inserted: number; unavailable: number }
  endpoints: { stable: number; updated: number; inserted: number; unavailable: number }
  providers: { stable: number; updated: number; inserted: number; unavailable: number }

  // Changes summary
  changes: {
    total: number
    creates: number
    updates: number
    deletes: number
  }
}

/**
 * Compute what needs to be done to the database
 *
 * Given the previous archive (or current DB state if no previous archive)
 * and the new archive, compute:
 * 1. What views need to be inserted/updated/marked unavailable
 * 2. What changes to record
 *
 * This is a pure function that returns instructions - the actual DB writes
 * happen in a mutation.
 */
export function computeMaterializeInstructions(args: {
  previous: ViewArchiveBundle | null
  current: ViewArchiveBundle
  currentDbState?: {
    models: Map<string, Doc<'or_views_models'>>
    endpoints: Map<string, Doc<'or_views_endpoints'>>
    providers: Map<string, Doc<'or_views_providers'>>
  }
}): {
  models: {
    insert: ModelViewData[]
    update: Array<{ id: string; data: ModelViewData }>
    markUnavailable: string[]
  }
  endpoints: {
    insert: EndpointViewData[]
    update: Array<{ id: string; data: EndpointViewData }>
    markUnavailable: string[]
  }
  providers: {
    insert: ProviderViewData[]
    update: Array<{ id: string; data: ProviderViewData }>
    markUnavailable: string[]
  }
  changes: ChangeRecord[]
} {
  const { previous, current, currentDbState } = args

  // If we have a previous archive, use it for comparison
  // Otherwise, use the current DB state (for first run or migration)
  const prevModels = previous
    ? new Map(previous.models.map((m) => [m.slug, m]))
    : currentDbState
      ? new Map([...currentDbState.models.entries()].map(([k, v]) => [k, stripSystemFields(v)]))
      : new Map<string, ModelViewData>()

  const prevEndpoints = previous
    ? new Map(previous.endpoints.map((e) => [e.uuid, e]))
    : currentDbState
      ? new Map([...currentDbState.endpoints.entries()].map(([k, v]) => [k, stripSystemFields(v)]))
      : new Map<string, EndpointViewData>()

  const prevProviders = previous
    ? new Map(previous.providers.map((p) => [p.slug, p]))
    : currentDbState
      ? new Map([...currentDbState.providers.entries()].map(([k, v]) => [k, stripSystemFields(v)]))
      : new Map<string, ProviderViewData>()

  const currModels = new Map(current.models.map((m) => [m.slug, m]))
  const currEndpoints = new Map(current.endpoints.map((e) => [e.uuid, e]))
  const currProviders = new Map(current.providers.map((p) => [p.slug, p]))

  // Compute model instructions
  const modelInstructions = computeEntityInstructions({
    previous: prevModels,
    current: currModels,
    currentDbIds: currentDbState?.models,
  })

  // Compute endpoint instructions
  const endpointInstructions = computeEntityInstructions({
    previous: prevEndpoints,
    current: currEndpoints,
    currentDbIds: currentDbState?.endpoints,
  })

  // Compute provider instructions
  const providerInstructions = computeEntityInstructions({
    previous: prevProviders,
    current: currProviders,
    currentDbIds: currentDbState?.providers,
  })

  // Compute changes (only if we have a previous archive for proper change tracking)
  const changes: ChangeRecord[] = previous
    ? compareArchives({ previous, current })
    : []

  return {
    models: modelInstructions,
    endpoints: endpointInstructions,
    providers: providerInstructions,
    changes,
  }
}

function computeEntityInstructions<T>(args: {
  previous: Map<string, T>
  current: Map<string, T>
  currentDbIds?: Map<string, { _id: string }>
}): {
  insert: T[]
  update: Array<{ id: string; data: T }>
  markUnavailable: string[]
} {
  const { previous, current, currentDbIds } = args

  const insert: T[] = []
  const update: Array<{ id: string; data: T }> = []
  const markUnavailable: string[] = []

  const processedKeys = new Set<string>()

  // Process current items
  for (const [key, item] of current) {
    processedKeys.add(key)
    const prevItem = previous.get(key)

    if (!prevItem) {
      // New item - insert
      insert.push(item)
    } else if (!isShallowEqual(prevItem, item)) {
      // Changed - update (need the DB ID)
      const dbEntry = currentDbIds?.get(key)
      if (dbEntry) {
        update.push({ id: dbEntry._id, data: item })
      } else {
        // No DB entry yet, treat as insert
        insert.push(item)
      }
    }
    // If equal, no action needed (stable)
  }

  // Find items that are no longer in current (mark unavailable)
  for (const [key] of previous) {
    if (!processedKeys.has(key)) {
      const dbEntry = currentDbIds?.get(key)
      if (dbEntry) {
        markUnavailable.push(dbEntry._id)
      }
    }
  }

  return { insert, update, markUnavailable }
}

function stripSystemFields<T extends { _id?: unknown; _creationTime?: unknown; updated_at?: unknown }>(
  obj: T,
): Omit<T, '_id' | '_creationTime' | 'updated_at'> {
  const { _id, _creationTime, updated_at, ...rest } = obj
  return rest as Omit<T, '_id' | '_creationTime' | 'updated_at'>
}

function isShallowEqual(a: unknown, b: unknown): boolean {
  const changeset = diff(a as any, b as any, {
    keysToSkip: ['_id', '_creationTime', 'updated_at'],
  })
  return changeset.length === 0
}

// ============================================================================
// ARCHIVE STORAGE UTILITIES
// ============================================================================

export type ViewArchiveMetadata = {
  crawl_id: string
  storage_id: string
  version: 2
  totals: {
    models: number
    endpoints: number
    providers: number
  }
  size: {
    raw: number
    compressed: number
    ratio: number
  }
}

// ============================================================================
// DOCUMENTATION
// ============================================================================

/**
 * MIGRATION PATH
 *
 * To migrate from the old archive format to the new one:
 *
 * 1. Deploy this code alongside existing pipeline
 * 2. New crawls produce view-format archives
 * 3. Change detection can handle:
 *    - Two v2 archives: direct comparison
 *    - v1 → v2: transform v1 during comparison (one-time cost)
 * 4. Once all archives are v2, remove v1 compatibility code
 *
 * BENEFITS OF NEW FORMAT
 *
 * 1. No transformation during materialize - data is already in view format
 * 2. Archive-to-archive comparison - no need to query DB state
 * 3. Changes produced atomically - part of the same comparison
 * 4. Simpler mental model - archive = snapshot of views
 * 5. Smaller archives - no duplicate nested data
 *
 * COMPARISON WITH OLD FORMAT
 *
 * Old format (nested):
 * {
 *   models: [{
 *     model: { slug, ... },
 *     endpoints: [{ id, ... }, ...],  // Full endpoint objects nested
 *     uptimes: [...],
 *   }, ...]
 * }
 *
 * New format (flat):
 * {
 *   models: [{ slug, ... }, ...],      // Standalone model views
 *   endpoints: [{ uuid, ... }, ...],   // Standalone endpoint views
 *   providers: [{ slug, ... }, ...],   // Standalone provider views
 * }
 */
