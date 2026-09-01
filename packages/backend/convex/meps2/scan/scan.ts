import { asyncMap } from 'convex-helpers'
import { up } from 'up-fetch'

import {
  catalogModelsPageSchema,
  encodeScanArtifact,
  SCAN_PATH,
  scanArtifactId,
  statsEndpointsPageSchema,
} from './scanArtifact'
import type { CatalogModel, ScanArtifact, ScanArtifactRow, StatsEndpoint } from './scanArtifact'

export { SCAN_PATH, type ScanArtifact, type ScanArtifactRow } from './scanArtifact'

const orFetch = up(fetch, () => ({
  baseUrl: 'https://openrouter.ai',
  retry: {
    attempts: 3,
    delay: (ctx) => ctx.attempt ** 2 * 1000,
  },
}))

/**
 * Fetch OpenRouter and serialize one complete scan artifact.
 *
 * HTTP only: call from an action. Returns uncompressed JSONL and identity; the
 * caller stores. The caller assigns `scan_at` before the first request.
 * Fetch and parse failures from `up-fetch` propagate unchanged.
 */
export async function scan(args: { scan_at: string }): Promise<ScanArtifact> {
  const { scan_at } = args
  const catalog = await fetchCatalogModels()
  const rows = await buildRows(scan_at, catalog)

  return {
    path: SCAN_PATH,
    artifact_id: scanArtifactId(scan_at),
    scan_at,
    bytes: encodeScanArtifact(rows.toSorted((a, b) => compareUtf16(a.model_id, b.model_id))),
  }
}

async function fetchCatalogModels(): Promise<CatalogModel[]> {
  const { data } = await orFetch('/api/frontend/v1/catalog/models', {
    schema: catalogModelsPageSchema,
  })
  return data
}

async function fetchEndpointPage(permaslug: string, variant: string): Promise<StatsEndpoint[]> {
  const { data } = await orFetch('/api/frontend/v1/stats/endpoint', {
    params: { permaslug, variant },
    schema: statsEndpointsPageSchema,
  })
  return data
}

async function buildRows(scan_at: string, catalog: CatalogModel[]): Promise<ScanArtifactRow[]> {
  const listed = catalog.filter((model) => !model.slug.startsWith('~'))

  return await asyncMap(listed, async (raw) => {
    const { endpoint, ...model } = raw

    if (endpoint === null || endpoint === undefined) {
      return {
        scan_at,
        model_id: raw.slug,
        variant: 'standard',
        model,
        endpoints: null,
      }
    }

    const page = await fetchEndpointPage(raw.permaslug, endpoint.variant)

    return {
      scan_at,
      model_id: endpoint.model_variant_slug,
      variant: endpoint.variant,
      model,
      endpoints: page.map(stripNestedModel).toSorted((a, b) => compareUtf16(a.id, b.id)),
    }
  })
}

function stripNestedModel(endpoint: StatsEndpoint): StatsEndpoint {
  const { model: _nested, ...rest } = endpoint as StatsEndpoint & { model?: unknown }
  return rest
}

function compareUtf16(a: string, b: string) {
  if (a === b) {
    return 0
  }

  return a < b ? -1 : 1
}
