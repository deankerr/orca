import { isRecord } from '../transform/json.ts'
import type { JsonRecord } from '../transform/json.ts'
import type { CleanBundle, CleanResult } from './types.ts'

const isTextOutput = (model: JsonRecord) => {
  const output = model.output_modalities
  return Array.isArray(output) && output.length === 1 && output[0] === 'text'
}

export const cleanBundle = (value: unknown): CleanResult => {
  if (!isRecord(value) || typeof value.crawl_id !== 'string' || !isRecord(value.data)) {
    return { _tag: 'Dropped', crawlId: 'unknown', reason: 'malformed-bundle' }
  }
  const crawlId = value.crawl_id
  if (!Array.isArray(value.data.models)) {
    return { _tag: 'Dropped', crawlId, reason: 'malformed-bundle' }
  }
  if (value.data.models.length === 0) {
    return { _tag: 'Dropped', crawlId, reason: 'empty-catalog' }
  }

  const models: CleanBundle['data']['models'][number][] = []
  let endpointCount = 0
  for (const scope of value.data.models) {
    if (!isRecord(scope) || !isRecord(scope.model)) {
      return { _tag: 'Dropped', crawlId, reason: 'malformed-bundle' }
    }
    if (!isTextOutput(scope.model)) {
      continue
    }
    if (!Array.isArray(scope.endpoints)) {
      return { _tag: 'Dropped', crawlId, reason: 'failed-text-endpoint-scope' }
    }
    const endpoints = scope.endpoints.filter(
      (endpoint): endpoint is JsonRecord =>
        isRecord(endpoint) && isRecord(endpoint.model) && isTextOutput(endpoint.model),
    )
    endpointCount += endpoints.length
    models.push({ endpoints, model: scope.model })
  }
  if (endpointCount === 0) {
    return { _tag: 'Dropped', crawlId, reason: 'no-text-endpoints' }
  }
  return {
    _tag: 'Accepted',
    bundle: { crawl_id: crawlId, data: { models } },
    endpoints: endpointCount,
    modelScopes: models.length,
  }
}
