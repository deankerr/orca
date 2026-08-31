import { asyncMap } from 'convex-helpers'
import { ConvexError } from 'convex/values'
import * as R from 'remeda'
import { up } from 'up-fetch'
import { z } from 'zod'

/** Grouping prefix passed to `artifacts.store`. */
export const SCAN_PATH = 'scan' as const

const orFetch = up(fetch, () => ({
  baseUrl: 'https://openrouter.ai',
  retry: {
    attempts: 3,
    delay: (ctx) => ctx.attempt ** 2 * 1000,
  },
}))

const dataEnvelope = z.object({
  data: z.array(z.unknown()),
})

/** One JSONL line of a scan artifact. */
export type ScanArtifactRow = {
  /** Identity of this scan. Same value on every row. */
  scan_at: string
  /** ORCA model key: nested catalog `model_variant_slug`, else `slug`. */
  model_id: string
  /** Nested catalog `endpoint.variant`, else `standard`. */
  variant: string
  /** Catalog model with nested `endpoint` removed. */
  model: Record<string, unknown>
  /** Stats-page endpoints with nested `model` removed, or `null` if we did not look. */
  endpoints: Record<string, unknown>[] | null
}

/** Unstored scan artifact. Ready for `artifacts.store`. */
export type ScanArtifact = {
  path: typeof SCAN_PATH
  /** `scan.{scan_at}.jsonl`. */
  artifact_id: string
  scan_at: string
  /** Uncompressed UTF-8 JSONL. What `artifacts.store` hashes. */
  bytes: Uint8Array
}

/**
 * Fetch OpenRouter and serialize one complete scan artifact.
 *
 * HTTP only: call from an action. Does not persist; the run layer stores the bytes.
 * Fetch and parse failures from `up-fetch` propagate unchanged.
 *
 * @throws {ConvexError} If a catalog row is missing fields needed to fetch or write the row.
 */
export async function scan(): Promise<ScanArtifact> {
  const scan_at = new Date().toISOString()
  const catalog = await fetchCatalogModels()
  const rows = await buildRows(scan_at, catalog)

  return {
    path: SCAN_PATH,
    artifact_id: `scan.${scan_at}.jsonl`,
    scan_at,
    bytes: encodeJsonl(rows.toSorted((a, b) => compareUtf16(a.model_id, b.model_id))),
  }
}

async function fetchCatalogModels(): Promise<Record<string, unknown>[]> {
  const { data } = await orFetch('/api/frontend/v1/catalog/models', {
    schema: dataEnvelope,
  })

  return data.map((item) => requireRecord(item, 'catalog model'))
}

async function fetchEndpointPage(
  permaslug: string,
  variant: string,
): Promise<Record<string, unknown>[]> {
  const { data } = await orFetch('/api/frontend/v1/stats/endpoint', {
    params: { permaslug, variant },
    schema: dataEnvelope,
  })

  return data.map((item) => requireRecord(item, 'endpoint'))
}

async function buildRows(
  scan_at: string,
  catalog: Record<string, unknown>[],
): Promise<ScanArtifactRow[]> {
  const listed = catalog.filter((model) => {
    const slug = requireString(model.slug, 'slug')
    return !slug.startsWith('~')
  })

  return await asyncMap(listed, async (raw) => {
    const slug = requireString(raw.slug, 'slug')
    const permaslug = requireString(raw.permaslug, 'permaslug')
    const model = R.omit(raw, ['endpoint'])

    if (raw.endpoint === null || raw.endpoint === undefined) {
      return {
        scan_at,
        model_id: slug,
        variant: 'standard',
        model,
        endpoints: null,
      }
    }

    const nested = requireRecord(raw.endpoint, 'nested catalog endpoint')
    const model_id = requireString(nested.model_variant_slug, 'endpoint.model_variant_slug')
    const variant = requireString(nested.variant, 'endpoint.variant')
    const page = await fetchEndpointPage(permaslug, variant)

    return {
      scan_at,
      model_id,
      variant,
      model,
      endpoints: page
        .map(stripNestedModel)
        .toSorted((a, b) => compareUtf16(endpointId(a), endpointId(b))),
    }
  })
}

function stripNestedModel(endpoint: Record<string, unknown>): Record<string, unknown> {
  return R.omit(endpoint, ['model'])
}

function endpointId(endpoint: Record<string, unknown>) {
  return typeof endpoint.id === 'string' ? endpoint.id : ''
}

function encodeJsonl(rows: ScanArtifactRow[]): Uint8Array {
  const body = `${rows
    .map((row) =>
      JSON.stringify({
        scan_at: row.scan_at,
        model_id: row.model_id,
        variant: row.variant,
        model: row.model,
        endpoints: row.endpoints,
      }),
    )
    .join('\n')}\n`

  return new TextEncoder().encode(body)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw new ConvexError({ message: `expected object for ${label}` })
  }
  return value
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ConvexError({ message: `missing ${field}`, field })
  }
  return value
}

function compareUtf16(a: string, b: string) {
  if (a === b) {
    return 0
  }
  return a < b ? -1 : 1
}
