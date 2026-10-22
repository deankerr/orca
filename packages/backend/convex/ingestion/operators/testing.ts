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
      model_id: endpoint.model,
      variant: 'standard',
      model: {
        slug: endpoint.model,
        permaslug: endpoint.model,
        short_name: name(endpoint.model),
        created_at: '2026-01-01T00:00:00.000Z',
        input_modalities: ['text'],
        output_modalities: ['text'],
      },
      endpoints: [],
    }

    entry.endpoints.push({
      id,
      model_variant_slug: endpoint.model,
      variant: 'standard',
      provider_slug:
        endpoint.tag === undefined ? endpoint.provider : `${endpoint.provider}/${endpoint.tag}`,
      provider_info: { slug: endpoint.provider, displayName: name(endpoint.provider) },
      provider_display_name: name(endpoint.provider),
      pricing: { discount: 0, prompt: endpoint.prompt ?? '0.000001' },
      ...(endpoint.stats === undefined ? {} : { statsByTier: endpoint.stats }),
    })
    entries.set(endpoint.model, entry)
  }

  // Collection always lists some models; an unserved one is outside ORCA's scope.
  const unserved: ScanEntry = {
    model_id: 'unserved',
    variant: 'standard',
    model: {
      slug: 'unserved',
      permaslug: 'unserved',
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    endpoints: null,
  }

  return { scan_at, entries: [...entries.values(), unserved] }
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
        endpoints[endpoint] = {
          model: pick(['m1', 'm2', 'm3']),
          provider: pick(['p1', 'p2']),
          tag: pick(['a', 'b']),
          prompt: pick(['0.1', '0.2']),
          ...(draw() < 0.7
            ? {
                stats: { default: { p50_latency: Math.floor(draw() * 100), p50_throughput: null } },
              }
            : {}),
        }
      }
    }

    return { endpoints, names }
  })
}

/** Extracted scans for `specs`, one hour apart. */
export function sequence(seed: number, length: number): Scan[] {
  return specs(seed, length).map((spec, index) => scan(hour(index), spec))
}
