import type { JsonProfile, JsonRecord, JsonValue, ViewOptions } from '@orca/json-profile'
import { profileJsonRecords, viewProfile } from '@orca/json-profile'
import { z } from 'zod'

import type { RawScan } from '../scan/collected'
import { extract } from '../scan/extract'

export type Selection = { model?: string; provider?: string; scope: 'orca' | 'collected' }
export type Population = {
  examples: Record<string, { id: string; value: JsonValue }[]>
  profile: JsonProfile
}
export type ScanReport = {
  endpoints: Population
  models: Population
  providers: Population
  report_format: 'orca-scan-profile-v1'
  selection: Selection
  source: { deployment: string; scan_at: string }
}

const jsonRecord = z.record(z.string(), z.json())
const providerBody = z.object({ slug: z.string() }).catchall(z.json())

/** Profile one explicitly scoped population, retaining a few identities beside primitive examples. */
export function profileScan(scan: RawScan, deployment: string, selection: Selection): ScanReport {
  const extracted = selection.scope === 'orca' ? extract(scan) : null
  const models = new Map<string, JsonRecord>()
  const endpoints = new Map<string, JsonRecord>()
  const providers = new Map<string, JsonRecord>()
  const relationships = new Map<string, { model: string; provider: string }>()

  for (const entry of scan.entries) {
    if (extracted !== null && !extracted.models.has(entry.model_id)) {
      continue
    }

    if (models.has(entry.model_id)) {
      throw new Error(`Duplicate model identity: ${entry.model_id}`)
    }

    const model = extracted?.models.get(entry.model_id)

    models.set(
      entry.model_id,
      model ??
        jsonRecord.parse({
          ...entry.model,
          id: entry.model_id,
          variant: entry.variant,
        }),
    )

    for (const endpoint of entry.endpoints ?? []) {
      if (endpoints.has(endpoint.id)) {
        throw new Error(`Duplicate endpoint identity: ${endpoint.id}`)
      }

      const scopedEndpoint = extracted?.endpoints.get(endpoint.id)

      if (scopedEndpoint === undefined) {
        const { slug, ...provider } = providerBody.parse(endpoint.provider_info)
        providers.set(slug, { ...provider, provider_id: slug })
        endpoints.set(endpoint.id, jsonRecord.parse(endpoint))
        relationships.set(endpoint.id, { model: entry.model_id, provider: slug })
      } else {
        endpoints.set(endpoint.id, scopedEndpoint)
        relationships.set(endpoint.id, {
          model: entry.model_id,
          provider: scopedEndpoint.provider_id,
        })
      }
    }
  }

  const scoped = extracted ?? { endpoints, models, providers }

  const selectedEndpoints = [...scoped.endpoints].filter(([id]) => {
    const relation = relationships.get(id)
    return (
      (selection.model === undefined || relation?.model === selection.model) &&
      (selection.provider === undefined || relation?.provider === selection.provider)
    )
  })

  const relatedModels = new Set(selectedEndpoints.map(([id]) => relationships.get(id)?.model))
  const relatedProviders = new Set(selectedEndpoints.map(([id]) => relationships.get(id)?.provider))

  const selectedModels = [...scoped.models].filter(
    ([id]) =>
      (selection.model === undefined || id === selection.model) &&
      (selection.provider === undefined || relatedModels.has(id)),
  )

  const selectedProviders = [...scoped.providers].filter(
    ([id]) =>
      (selection.provider === undefined || id === selection.provider) &&
      (selection.model === undefined || relatedProviders.has(id)),
  )

  return {
    endpoints: profilePopulation(selectedEndpoints),
    models: profilePopulation(selectedModels),
    providers: profilePopulation(selectedProviders),
    report_format: 'orca-scan-profile-v1',
    selection,
    source: { deployment, scan_at: scan.scan_at },
  }
}

export type PopulationName = 'models' | 'endpoints' | 'providers'
export type ScanViewOptions = ViewOptions & { population?: PopulationName }

/** Refine the same full report for agents; selection never changes how profiling is performed. */
export function viewScanReport(report: ScanReport, options: ScanViewOptions = {}) {
  const populations: PopulationName[] =
    options.population === undefined ? ['models', 'endpoints', 'providers'] : [options.population]

  return {
    report_format: 'orca-scan-profile-view-v1' as const,
    source: report.source,
    selection: report.selection,
    populations: populations.map((name) => ({
      name,
      ...viewProfile(report[name].profile, options),
    })),
  }
}

export type ScanReportView = ReturnType<typeof viewScanReport>

function profilePopulation(entries: [string, JsonRecord][]): Population {
  const ordered = entries.toSorted(([left], [right]) => (left < right ? -1 : Number(left > right)))
  const examples: Population['examples'] = {}

  function visit(id: string, value: JsonValue, path: string): void {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(id, item, `${path}[*]`)
      }
    } else if (value !== null && typeof value === 'object') {
      for (const [key, field] of Object.entries(value)) {
        visit(id, field, `${path}[${JSON.stringify(key)}]`)
      }
    } else {
      const samples = examples[path] ?? []
      examples[path] = samples

      if (samples.length < 3 && !samples.some((sample) => sample.value === value)) {
        samples.push({ id, value })
      }
    }
  }

  for (const [id, record] of ordered) {
    visit(id, record, '$[*]')
  }

  return { examples, profile: profileJsonRecords(ordered.map(([, record]) => record)) }
}
