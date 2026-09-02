import { parseScanArtifact } from '../scan/scanArtifact'
import type { ScanArtifactRow, StatsEndpoint } from '../scan/scanArtifact'

/** Catalog model after envelope identity is attached. */
export type SourceModel = ScanArtifactRow['model'] & {
  model_id: string
  variant: string
}

/** Stats-page endpoint after parent-row identity is attached. */
export type SourceEndpoint = StatsEndpoint & {
  model_id: string
  variant: string
}

/** Source-shaped catalog maps. Compare runs on these, flattening happens at write. */
export type Catalog = {
  /** Keyed by `model_id`. */
  models: Map<string, SourceModel>
  /** Keyed by upstream endpoint `id`. */
  endpoints: Map<string, SourceEndpoint>
}

/** Empty maps. First ingest uses this as `before`. */
export function emptyCatalog(): Catalog {
  return { models: new Map(), endpoints: new Map() }
}

/**
 * Deserialize scan-artifact JSONL into two maps and apply the text-modality filter.
 *
 * Duplicate `model_id` or endpoint `id` in one file: last line wins.
 * `model_id` and `variant` from the parent row are attached onto each endpoint.
 *
 * @throws {SyntaxError} If a line is not JSON.
 * @throws {ZodError} If a line fails `scanArtifactRowSchema`.
 */
export function explode(text: string): Catalog {
  const models = new Map<string, SourceModel>()
  const endpoints = new Map<string, SourceEndpoint>()

  for (const row of parseScanArtifact(text)) {
    models.set(row.model_id, {
      ...row.model,
      model_id: row.model_id,
      variant: row.variant,
    })

    if (row.endpoints === null) {
      continue
    }

    for (const endpoint of row.endpoints) {
      endpoints.set(endpoint.id, {
        ...endpoint,
        model_id: row.model_id,
        variant: row.variant,
      })
    }
  }

  return filterTextModalities({ models, endpoints })
}

function filterTextModalities(catalog: Catalog): Catalog {
  const models = new Map<string, SourceModel>()
  for (const [id, model] of catalog.models) {
    if (model.input_modalities.includes('text') && model.output_modalities.includes('text')) {
      models.set(id, model)
    }
  }

  const endpoints = new Map<string, SourceEndpoint>()
  for (const [id, endpoint] of catalog.endpoints) {
    if (models.has(endpoint.model_id)) {
      endpoints.set(id, endpoint)
    }
  }

  return { models, endpoints }
}
