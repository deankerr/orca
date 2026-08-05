import { Database } from 'bun:sqlite'

import * as Core from '@orca/schema/area-2-core.ts'
import type { CoreEndpoint, CoreModel, CorePricing } from '@orca/schema/area-2-core.ts'
import * as Schema from 'effect/Schema'
import { diff } from 'json-diff-ts'

import type { MaterializedCrawl, MaterializedEndpoint } from './materialize.ts'
import { initializeProductDatabase } from './schema.ts'

type ChangeKind = 'available' | 'baseline' | 'unavailable' | 'updated'
type ContextKind = 'entity' | 'none' | 'pricing'

type EndpointState = MaterializedEndpoint

interface ModelChange {
  readonly changeset: readonly unknown[]
  readonly context: CoreModel | null
  readonly contextKind: Extract<ContextKind, 'entity' | 'none'>
  readonly kind: ChangeKind
  readonly modelSlug: string
}

interface EndpointChange {
  readonly changeset: readonly unknown[]
  readonly context: EndpointEntityContext | PricingContext | null
  readonly contextKind: ContextKind
  readonly endpoint: EndpointState
  readonly kind: ChangeKind
}

interface StoredModelRow {
  readonly slug: string
  readonly state_json: string
}

interface StoredEndpointRow {
  readonly id: string
  readonly model_slug: string
  readonly provider_name: string | null
  readonly provider_slug: string | null
  readonly state_json: string
}

interface StoredCrawlRow {
  readonly crawl_id: string
}

interface EndpointEntityContext {
  readonly endpoint: CoreEndpoint
  readonly model: Pick<CoreModel, 'name' | 'slug'>
}

interface PricingContext {
  readonly pricing: CorePricing
}

const DIFF_OPTIONS = {
  embeddedObjKeys: {
    'endpoint.supported_parameters': '$value',
    input_modalities: '$value',
    output_modalities: '$value',
  },
}

const decodeModel = Schema.decodeUnknownSync(Core.CoreModel)
const decodeEndpoint = Schema.decodeUnknownSync(Core.CoreEndpoint)

const parseStoredJson = (value: string, description: string): unknown => {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`stored ${description} is not valid JSON`)
  }
}

const json = (value: unknown) => JSON.stringify(value)

const compareCrawlIds = (left: string, right: string) => {
  const leftId = BigInt(left)
  const rightId = BigInt(right)
  if (leftId === rightId) {
    return 0
  }
  return leftId < rightId ? -1 : 1
}

const eventKind = (
  before: unknown,
  after: unknown,
  previousCrawlId: string | undefined,
): ChangeKind => {
  if (before === undefined) {
    return previousCrawlId === undefined ? 'baseline' : 'available'
  }
  if (after === undefined) {
    return 'unavailable'
  }
  return 'updated'
}

const changesetIncludesKey = (changeset: readonly unknown[], key: string): boolean =>
  changeset.some((change) => {
    if (typeof change !== 'object' || change === null || Array.isArray(change)) {
      return false
    }
    const candidate = change as { readonly changes?: unknown; readonly key?: unknown }
    if (candidate.key === key) {
      return true
    }
    return Array.isArray(candidate.changes) && changesetIncludesKey(candidate.changes, key)
  })

const endpointStateForDiff = (state: EndpointState) => ({
  endpoint: state.endpoint,
  model_slug: state.modelSlug,
})

const modelDisplayContext = (model: CoreModel): Pick<CoreModel, 'name' | 'slug'> => ({
  name: model.name,
  slug: model.slug,
})

const endpointEntityContext = (
  endpoint: EndpointState,
  model: CoreModel,
): EndpointEntityContext => ({
  endpoint: endpoint.endpoint,
  model: modelDisplayContext(model),
})

const pricingContext = (endpoint: EndpointState): PricingContext => ({
  pricing: endpoint.endpoint.pricing,
})

/**
 * A local, incrementally maintained product database. Its input is a complete materialized crawl;
 * it has no knowledge of bundle archives, playback, or capture orchestration.
 */
export class ProductDatabase {
  readonly #database: Database
  #endpoints: Map<string, EndpointState>
  #lastCrawlId: string | undefined
  #models: Map<string, CoreModel>

  private constructor(
    database: Database,
    models: Map<string, CoreModel>,
    endpoints: Map<string, EndpointState>,
    lastCrawlId: string | undefined,
  ) {
    this.#database = database
    this.#models = models
    this.#endpoints = endpoints
    this.#lastCrawlId = lastCrawlId
  }

  /** Opens or creates a product database and restores its latest current state for later updates. */
  static open(filename: string) {
    const database = new Database(filename)
    initializeProductDatabase(database)

    const models = new Map(
      database
        .query<StoredModelRow, []>('SELECT slug, state_json FROM models')
        .all()
        .map((row) => [
          row.slug,
          decodeModel(parseStoredJson(row.state_json, `model ${row.slug}`)),
        ]),
    )
    const endpoints = new Map(
      database
        .query<StoredEndpointRow, []>(
          'SELECT id, model_slug, provider_name, provider_slug, state_json FROM endpoints',
        )
        .all()
        .map((row) => [
          row.id,
          {
            endpoint: decodeEndpoint(parseStoredJson(row.state_json, `endpoint ${row.id}`)),
            metrics: undefined,
            modelSlug: row.model_slug,
            providerName: row.provider_name,
            providerSlug: row.provider_slug,
          },
        ]),
    )
    const lastCrawlId = database
      .query<StoredCrawlRow, []>(
        'SELECT crawl_id FROM crawls ORDER BY CAST(crawl_id AS INTEGER) DESC LIMIT 1',
      )
      .get()?.crawl_id

    return new ProductDatabase(database, models, endpoints, lastCrawlId)
  }

  /** The most recently committed crawl, for orchestration that chooses an incremental source read. */
  get latestCrawlId() {
    return this.#lastCrawlId
  }

  close() {
    this.#database.close()
  }

  /**
   * Commits one chronologically newer complete crawl. Reapplying the current cursor is a no-op;
   * attempting to insert a missing older crawl is rejected so current state and history cannot diverge.
   */
  applyCrawl(crawl: MaterializedCrawl): {
    readonly endpointChanges: number
    readonly modelChanges: number
    readonly status: 'applied' | 'already-applied'
  } {
    if (this.#lastCrawlId !== undefined && compareCrawlIds(crawl.crawlId, this.#lastCrawlId) <= 0) {
      const existing = this.#database
        .query<StoredCrawlRow, [string]>('SELECT crawl_id FROM crawls WHERE crawl_id = ?')
        .get(crawl.crawlId)
      if (existing !== null) {
        return { endpointChanges: 0, modelChanges: 0, status: 'already-applied' }
      }
      throw new Error(
        `crawl ${crawl.crawlId} is older than product database cursor ${this.#lastCrawlId}`,
      )
    }

    const nextModels = new Map(crawl.models.map((model) => [model.slug, model]))
    const nextEndpoints = new Map(
      crawl.endpoints.map((endpoint) => [endpoint.endpoint.id, endpoint]),
    )

    const modelChanges = this.#modelChanges(nextModels)
    const endpointChanges = this.#endpointChanges(nextEndpoints, nextModels)
    const previousCrawlId = this.#lastCrawlId

    this.#database.transaction(() => {
      this.#database
        .query('INSERT INTO crawls (crawl_id, previous_crawl_id, processed_at) VALUES (?, ?, ?)')
        .run(crawl.crawlId, previousCrawlId ?? null, new Date(Number(crawl.crawlId)).toISOString())

      this.#replaceCurrentState(nextModels, nextEndpoints, crawl.crawlId)
      this.#writeModelChanges(modelChanges, crawl.crawlId, previousCrawlId)
      this.#writeEndpointChanges(endpointChanges, crawl.crawlId, previousCrawlId)
    })()

    this.#models = nextModels
    this.#endpoints = nextEndpoints
    this.#lastCrawlId = crawl.crawlId

    return {
      endpointChanges: endpointChanges.length,
      modelChanges: modelChanges.length,
      status: 'applied',
    }
  }

  #modelChanges(nextModels: ReadonlyMap<string, CoreModel>): ModelChange[] {
    const changes: ModelChange[] = []
    const slugs = new Set([...this.#models.keys(), ...nextModels.keys()])

    for (const slug of [...slugs].toSorted()) {
      const before = this.#models.get(slug)
      const after = nextModels.get(slug)
      const changeset = diff(before, after, DIFF_OPTIONS)
      if (changeset.length === 0) {
        continue
      }

      const kind = eventKind(before, after, this.#lastCrawlId)
      const context = after ?? before
      if (context === undefined) {
        continue
      }
      changes.push({
        changeset,
        context: kind === 'updated' ? null : context,
        contextKind: kind === 'updated' ? 'none' : 'entity',
        kind,
        modelSlug: slug,
      })
    }

    return changes
  }

  #endpointChanges(
    nextEndpoints: ReadonlyMap<string, EndpointState>,
    nextModels: ReadonlyMap<string, CoreModel>,
  ): EndpointChange[] {
    const changes: EndpointChange[] = []
    const ids = new Set([...this.#endpoints.keys(), ...nextEndpoints.keys()])

    for (const id of [...ids].toSorted()) {
      const before = this.#endpoints.get(id)
      const after = nextEndpoints.get(id)
      const changeset = diff(
        before === undefined ? undefined : endpointStateForDiff(before),
        after === undefined ? undefined : endpointStateForDiff(after),
        DIFF_OPTIONS,
      )
      if (changeset.length === 0) {
        continue
      }

      const kind = eventKind(before, after, this.#lastCrawlId)
      const endpoint = after ?? before
      if (endpoint === undefined) {
        continue
      }

      const model = (after === undefined ? this.#models : nextModels).get(endpoint.modelSlug)
      if (model === undefined) {
        throw new Error(`endpoint ${id} references unavailable model ${endpoint.modelSlug}`)
      }

      const pricingChanged = kind === 'updated' && changesetIncludesKey(changeset, 'pricing')
      let context: EndpointEntityContext | PricingContext | null
      let contextKind: ContextKind
      if (kind === 'updated') {
        context = pricingChanged ? pricingContext(endpoint) : null
        contextKind = pricingChanged ? 'pricing' : 'none'
      } else {
        context = endpointEntityContext(endpoint, model)
        contextKind = 'entity'
      }
      changes.push({
        changeset,
        context,
        contextKind,
        endpoint,
        kind,
      })
    }

    return changes
  }

  #replaceCurrentState(
    models: ReadonlyMap<string, CoreModel>,
    endpoints: ReadonlyMap<string, EndpointState>,
    crawlId: string,
  ) {
    this.#database.run('DELETE FROM models')
    this.#database.run('DELETE FROM endpoints')

    const insertModel = this.#database.query(
      'INSERT INTO models (slug, state_json, observed_crawl_id) VALUES (?, ?, ?)',
    )
    for (const [slug, model] of models) {
      insertModel.run(slug, json(model), crawlId)
    }

    const insertEndpoint = this.#database.query(
      `INSERT INTO endpoints
        (id, model_slug, provider_name, provider_slug, state_json, observed_crawl_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const [id, endpoint] of endpoints) {
      insertEndpoint.run(
        id,
        endpoint.modelSlug,
        endpoint.endpoint.provider_name,
        endpoint.endpoint.provider_slug,
        json(endpoint.endpoint),
        crawlId,
      )
    }
  }

  #writeModelChanges(changes: readonly ModelChange[], crawlId: string, previousCrawlId?: string) {
    const insert = this.#database.query(
      `INSERT INTO model_changes
        (crawl_id, previous_crawl_id, model_slug, change_kind, changeset_json, context_kind, context_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const change of changes) {
      insert.run(
        crawlId,
        previousCrawlId ?? null,
        change.modelSlug,
        change.kind,
        json(change.changeset),
        change.contextKind,
        change.context === null ? null : json(change.context),
      )
    }
  }

  #writeEndpointChanges(
    changes: readonly EndpointChange[],
    crawlId: string,
    previousCrawlId?: string,
  ) {
    const insert = this.#database.query(
      `INSERT INTO endpoint_changes
        (crawl_id, previous_crawl_id, endpoint_id, model_slug, provider_name, provider_slug,
         change_kind, changeset_json, context_kind, context_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const change of changes) {
      insert.run(
        crawlId,
        previousCrawlId ?? null,
        change.endpoint.endpoint.id,
        change.endpoint.modelSlug,
        change.endpoint.endpoint.provider_name,
        change.endpoint.endpoint.provider_slug,
        change.kind,
        json(change.changeset),
        change.contextKind,
        change.context === null ? null : json(change.context),
      )
    }
  }
}
