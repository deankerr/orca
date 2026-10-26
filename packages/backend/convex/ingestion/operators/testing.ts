import * as R from 'remeda'

import type { RawScan, ScanEntry } from '#scans/collection'
import { extractScan } from '#scans/extract'
import type { Scan } from '#scans/extraction'

type Sample = Record<string, number | string | null>

/** Endpoint facts used by tests; identity follows the endpoint ID. */
type EndpointSpec = {
  model: string
  provider: string
  /** Offering suffix of the provider slug; omitted means the bare provider slug. */
  tag?: string
  prompt?: string
  /** Supplied readings by tier. */
  stats?: Record<string, Sample>
}

export type ScanSpec = {
  endpoints?: Record<string, EndpointSpec>
  /** Display names for models and providers, keyed by ID; IDs serve as default names. */
  names?: Record<string, string>
}

/** Collected entries in OpenRouter's shape, as collection stores them. */
export function rawScan(scan_at: string, spec: ScanSpec = {}): RawScan {
  const name = (id: string) => spec.names?.[id] ?? id
  const entries = new Map<string, ScanEntry & { endpoints: NonNullable<ScanEntry['endpoints']> }>()

  for (const [id, endpoint] of Object.entries(spec.endpoints ?? {})) {
    const entry = entries.get(endpoint.model) ?? {
      endpoints: [],
      model: {
        created_at: '2026-01-01T00:00:00.000Z',
        input_modalities: ['text'],
        output_modalities: ['text'],
        permaslug: endpoint.model,
        short_name: name(endpoint.model),
        slug: endpoint.model,
      },
      model_id: endpoint.model,
      variant: 'standard',
    }

    entry.endpoints.push({
      id,
      model_variant_slug: endpoint.model,
      pricing: { discount: 0, prompt: endpoint.prompt ?? '0.000001' },
      provider_display_name: name(endpoint.provider),
      provider_info: { displayName: name(endpoint.provider), slug: endpoint.provider },
      provider_slug:
        endpoint.tag === undefined ? endpoint.provider : `${endpoint.provider}/${endpoint.tag}`,
      variant: 'standard',
      ...R.pickBy({ statsByTier: endpoint.stats }, R.isDefined),
    })
    entries.set(endpoint.model, entry)
  }

  // Collection always lists some models; an unserved one is outside ORCA's scope.
  const unserved: ScanEntry = {
    endpoints: null,
    model: {
      input_modalities: ['text'],
      output_modalities: ['text'],
      permaslug: 'unserved',
      slug: 'unserved',
    },
    model_id: 'unserved',
    variant: 'standard',
  }

  return { entries: [...entries.values(), unserved], scan_at }
}

/** The extracted scan for a spec, through ORCA's real extraction. */
export function scan(scan_at: string, spec: ScanSpec = {}): Scan {
  return extractScan(rawScan(scan_at, spec))
}

/** Hourly scan times starting at a fixed instant. */
export function hour(index: number): string {
  return new Date(Date.UTC(2026, 0, 1, index)).toISOString()
}

/** Deterministic pseudo-random source for generated scan sequences. */
export function random(seed: number): () => number {
  let state = seed % 2 ** 32

  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 2 ** 32

    return state / 2 ** 32
  }
}

/** A random sequence of specs over a small universe, so entities depart, return, and change facts. */
export function specs(seed: number, length: number): ScanSpec[] {
  const draw = random(seed)

  const pick = <T>(items: readonly T[]): T => {
    const item = items[Math.floor(draw() * items.length)]

    if (item === undefined) {
      throw new Error('Cannot pick from an empty list')
    }

    return item
  }

  return Array.from({ length }, () => {
    const endpoints: Record<string, EndpointSpec> = {}

    const names = Object.fromEntries(
      ['m1', 'm2', 'm3', 'p1', 'p2'].map((id) => [id, pick(['Alpha', 'Beta'])]),
    )

    for (const endpoint of ['e1', 'e2', 'e3', 'e4']) {
      if (draw() < 0.6) {
        const spec = {
          model: pick(['m1', 'm2', 'm3']),
          prompt: pick(['0.1', '0.2']),
          provider: pick(['p1', 'p2']),
          tag: pick(['a', 'b']),
        }

        endpoints[endpoint] =
          draw() < 0.7
            ? {
                ...spec,
                stats: { default: { p50_latency: Math.floor(draw() * 100), p50_throughput: null } },
              }
            : spec
      }
    }

    return { endpoints, names }
  })
}

/** Extracted scans for `specs`, one hour apart. */
export function sequence(seed: number, length: number): Scan[] {
  return specs(seed, length).map((spec, index) => scan(hour(index), spec))
}
