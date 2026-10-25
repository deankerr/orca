import type { JsonProfile, JsonRecord, JsonValue, ViewOptions } from '@orca/json-profile'
import { profileJsonRecords, viewProfile } from '@orca/json-profile'
import { ConvexError } from 'convex/values'
import { z } from 'zod'

import type { RawScan } from '#scans/collection'
import { extractScan } from '#scans/extract'

export type Selection = { scope: 'orca' | 'collected' }
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
  scan_at: string
}

const jsonRecord = z.record(z.string(), z.json())
const providerBody = z.object({ slug: z.string() }).catchall(z.json())

/** Profile one explicitly scoped population, retaining a few identities beside primitive examples. */
export function profileScan(scan: RawScan, selection: Selection): ScanReport {
  const extracted = selection.scope === 'orca' ? extractScan(scan) : null
  const models = new Map<string, JsonRecord>()
  const endpoints = new Map<string, JsonRecord>()
  const providers = new Map<string, JsonRecord>()

  for (const entry of scan.entries) {
    if (extracted !== null && !extracted.models.has(entry.model_id)) {
      continue
    }

    if (models.has(entry.model_id)) {
      throw new ConvexError({ message: 'Duplicate model identity', model_id: entry.model_id })
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
        throw new ConvexError({ endpoint_id: endpoint.id, message: 'Duplicate endpoint identity' })
      }

      const scopedEndpoint = extracted?.endpoints.get(endpoint.id)

      if (scopedEndpoint === undefined) {
        const observedProvider = providerBody.safeParse(endpoint.provider_info)

        if (observedProvider.success) {
          const { slug, ...provider } = observedProvider.data
          providers.set(slug, { ...provider, provider_id: slug })
        }

        endpoints.set(endpoint.id, jsonRecord.parse(endpoint))
      } else {
        endpoints.set(endpoint.id, scopedEndpoint)
      }
    }
  }

  const scoped = extracted ?? { endpoints, models, providers }

  return {
    endpoints: profilePopulation([...scoped.endpoints]),
    models: profilePopulation([...scoped.models]),
    providers: profilePopulation([...scoped.providers]),
    report_format: 'orca-scan-profile-v1',
    scan_at: scan.scan_at,
    selection,
  }
}

type PopulationName = 'models' | 'endpoints' | 'providers'
export type ScanViewOptions = ViewOptions & { population?: PopulationName }

/** Refine the same full report for agents; selection never changes how profiling is performed. */
export function viewScanReport(report: ScanReport, options: ScanViewOptions = {}) {
  const populations: PopulationName[] =
    options.population === undefined ? ['models', 'endpoints', 'providers'] : [options.population]

  // oxlint-disable sort-keys -- Serialized for agents; the report_format header and selection lead, populations follow.
  return {
    report_format: 'orca-scan-profile-view-v1' as const,
    scan_at: report.scan_at,
    selection: report.selection,
    populations: populations.map((name) => ({
      name,
      ...viewProfile(report[name].profile, options),
    })),
  }
  // oxlint-enable sort-keys
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
