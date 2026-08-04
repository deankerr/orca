import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'
import * as Core from '@orca/schema/archive-core.ts'
import * as Schema from 'effect/Schema'

import type { RawBundle } from '../bundle-archive/storage.ts'
import { isRecord } from '../transform/json.ts'
import type { JsonRecord } from '../transform/json.ts'
import type { EndpointMetrics, MaterializedEndpoint, ProjectionBatch } from './types.ts'

const decodeModel = Schema.decodeUnknownSync(Core.CoreModel)
const decodeEndpoint = Schema.decodeUnknownSync(Core.CoreEndpoint)

type MaterializationDropReason =
  | 'empty-catalog'
  | 'failed-text-endpoint-scope'
  | 'malformed-bundle'
  | 'no-text-endpoints'

export type MaterializationResult =
  | { readonly _tag: 'Accepted'; readonly batch: ProjectionBatch }
  | {
      readonly _tag: 'Dropped'
      readonly crawlId: string
      readonly reason: MaterializationDropReason
    }

export interface MaterializationCandidate {
  readonly crawlId: string
  readonly endpoints: readonly JsonRecord[]
}

export type InspectionResult =
  | { readonly _tag: 'Accepted'; readonly candidate: MaterializationCandidate }
  | {
      readonly _tag: 'Dropped'
      readonly crawlId: string
      readonly reason: MaterializationDropReason
    }

const textDecoder = new TextDecoder()

const isTextOutput = (model: JsonRecord) => {
  const output = model.output_modalities
  return Array.isArray(output) && output.length === 1 && output[0] === 'text'
}

const readMetrics = (endpoint: JsonRecord): EndpointMetrics | undefined => {
  if (!isRecord(endpoint.stats)) {
    return undefined
  }
  const p50Latency = endpoint.stats.p50_latency
  const p50Throughput = endpoint.stats.p50_throughput
  const metrics = {
    ...(typeof p50Latency === 'number' ? { p50Latency } : {}),
    ...(typeof p50Throughput === 'number' ? { p50Throughput } : {}),
  }
  return Object.keys(metrics).length === 0 ? undefined : metrics
}

/** Parses one raw bundle and applies only the structural policy needed to select usable crawls. */
export const inspectBundle = (bundle: Pick<RawBundle, 'bytes' | 'crawlId'>): InspectionResult => {
  let value: unknown
  try {
    value = JSON.parse(textDecoder.decode(bundle.bytes))
  } catch {
    return { _tag: 'Dropped', crawlId: bundle.crawlId, reason: 'malformed-bundle' }
  }
  if (!isRecord(value) || !isRecord(value.data) || !Array.isArray(value.data.models)) {
    return { _tag: 'Dropped', crawlId: bundle.crawlId, reason: 'malformed-bundle' }
  }
  if (value.crawl_id !== bundle.crawlId) {
    throw new Error(
      `archive crawl ${bundle.crawlId} contains mismatched bundle crawl id ${String(value.crawl_id)}`,
    )
  }
  if (value.data.models.length === 0) {
    return { _tag: 'Dropped', crawlId: bundle.crawlId, reason: 'empty-catalog' }
  }

  const endpoints: JsonRecord[] = []

  for (const scope of value.data.models) {
    if (!isRecord(scope) || !isRecord(scope.model)) {
      return { _tag: 'Dropped', crawlId: bundle.crawlId, reason: 'malformed-bundle' }
    }
    if (!isTextOutput(scope.model)) {
      continue
    }
    if (!Array.isArray(scope.endpoints)) {
      return {
        _tag: 'Dropped',
        crawlId: bundle.crawlId,
        reason: 'failed-text-endpoint-scope',
      }
    }
    for (const rawEndpoint of scope.endpoints) {
      if (
        !isRecord(rawEndpoint) ||
        !isRecord(rawEndpoint.model) ||
        !isTextOutput(rawEndpoint.model)
      ) {
        continue
      }

      endpoints.push(rawEndpoint)
    }
  }

  if (endpoints.length === 0) {
    return { _tag: 'Dropped', crawlId: bundle.crawlId, reason: 'no-text-endpoints' }
  }

  return { _tag: 'Accepted', candidate: { crawlId: bundle.crawlId, endpoints } }
}

/**
 * Projects one structurally accepted candidate. Endpoint-embedded models are authoritative and the
 * last copy for each slug wins, matching the production materializer.
 */
export const materializeCandidate = (candidate: MaterializationCandidate): ProjectionBatch => {
  const models = new Map<string, CoreModel>()
  const endpoints = new Map<string, MaterializedEndpoint>()

  for (const rawEndpoint of candidate.endpoints) {
    const model = decodeModel(rawEndpoint.model)
    const { model: _, ...rawEndpointData } = rawEndpoint
    const endpoint: CoreEndpoint = decodeEndpoint(rawEndpointData)
    models.set(model.slug, model)
    endpoints.set(endpoint.id, {
      endpoint,
      metrics: readMetrics(rawEndpoint),
      modelSlug: model.slug,
    })
  }

  return {
    crawlId: candidate.crawlId,
    endpoints: [...endpoints.values()].toSorted((left, right) =>
      left.endpoint.id.localeCompare(right.endpoint.id),
    ),
    models: [...models.values()].toSorted((left, right) => left.slug.localeCompare(right.slug)),
  }
}

/** Fully inspects and materializes one raw bundle when no replay selection policy is involved. */
export const materialize = (
  bundle: Pick<RawBundle, 'bytes' | 'crawlId'>,
): MaterializationResult => {
  const result = inspectBundle(bundle)
  return result._tag === 'Dropped'
    ? result
    : { _tag: 'Accepted', batch: materializeCandidate(result.candidate) }
}
