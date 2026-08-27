// oxlint-disable sort-keys -- Property order is part of the serialized JSON profile format.

import type { ModelEndpointsV1 } from '../model-endpoints-v1.ts'
import type { JsonProfile, JsonRecord, JsonValue } from './library/profile.ts'
import { profileJsonRecords } from './library/profile.ts'

export interface BundleProfileOptions {
  modelsWithText?: boolean
}

export interface BundleProfile {
  report_format: 'orca-bundle-json-profile-v1'
  source: {
    crawl_id: string
    crawl_at: string
    bundle_format: 'model-endpoints-v1'
  }
  selection: {
    models_with_text?: boolean
  }
  models: JsonProfile
  endpoints: JsonProfile
}

export interface BundleRecords {
  models: JsonRecord[]
  endpoints: JsonRecord[]
  metadata: BundleProfile['source']
}

export function profileBundle(
  data: ModelEndpointsV1,
  options: BundleProfileOptions = {},
): BundleProfile {
  const { endpoints, metadata, models } = extractBundleRecords(data, options)
  return {
    report_format: 'orca-bundle-json-profile-v1',
    source: metadata,
    selection: options.modelsWithText === true ? { models_with_text: true } : {},
    models: profileJsonRecords(models),
    endpoints: profileJsonRecords(endpoints),
  }
}

export function bundleProfileFilename(profile: BundleProfile): string {
  const variant = profile.selection.models_with_text === true ? '.text-only' : ''
  return `json-profile${variant}.${profile.source.crawl_at}.me1.orca.json`
}

export function extractBundleRecords(
  bundle: ModelEndpointsV1,
  options: BundleProfileOptions = {},
): BundleRecords {
  const modelsWithText = options.modelsWithText ?? false
  const models: JsonRecord[] = []
  const endpoints: JsonRecord[] = []

  for (const [entryIndex, entry] of bundle.data.entries()) {
    const model = requireRecord(entry.model, `bundle.data[${entryIndex}].model`)
    if (modelsWithText && !hasTextInputAndOutput(model)) {
      continue
    }
    models.push(model)

    for (const [endpointIndex, endpoint] of (entry.endpoints ?? []).entries()) {
      endpoints.push(
        requireRecord(endpoint, `bundle.data[${entryIndex}].endpoints[${endpointIndex}]`),
      )
    }
  }

  return {
    models,
    endpoints,
    metadata: copyMetadata(bundle),
  }
}

function hasTextInputAndOutput(model: JsonRecord): boolean {
  return hasTextModality(model.input_modalities) && hasTextModality(model.output_modalities)
}

function hasTextModality(value: JsonValue | undefined): boolean {
  return Array.isArray(value) && value.includes('text')
}

function requireRecord(value: unknown, path: string): JsonRecord {
  if (!isJsonRecord(value)) {
    throw new TypeError(`${path} must be a JSON object`)
  }
  return value
}

function copyMetadata(bundle: ModelEndpointsV1): BundleProfile['source'] {
  return {
    crawl_id: bundle.crawl_id,
    crawl_at: bundle.crawl_at,
    bundle_format: bundle.bundle_format,
  }
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(isJsonValue)
  )
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return true
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue)
  }
  return isJsonRecord(value)
}
