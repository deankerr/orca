import { z } from 'zod'

/** Grouping prefix passed to `artifacts.store`. */
export const SCAN_PATH = 'scan' as const

/** Nested catalog `endpoint` used as a fetch signal. Stripped before the row is written. */
const nestedCatalogEndpointSchema = z.looseObject({
  model_variant_slug: z.string().min(1),
  variant: z.string().min(1),
})

const modelIdentity = {
  slug: z.string().min(1),
  permaslug: z.string().min(1),
  input_modalities: z.array(z.string()),
  output_modalities: z.array(z.string()),
  created_at: z.string().min(1),
  name: z.string().min(1),
  author_display_name: z.string().min(1),
}

export const providerInfoSchema = z.looseObject({
  slug: z.string().min(1),
  displayName: z.string().min(1),
})

export const pricingSchema = z.looseObject({
  prompt: z.string().min(1),
  completion: z.string().min(1),
  discount: z.number(),
  image: z.string().optional(),
  image_output: z.string().optional(),
  input_cache_read: z.string().optional(),
  input_cache_write: z.string().optional(),
  input_cache_write_1h: z.string().optional(),
  audio: z.string().optional(),
  input_audio_cache: z.string().optional(),
  web_search: z.string().optional(),
  internal_reasoning: z.string().optional(),
  image_token: z.string().optional(),
  audio_output: z.string().optional(),
})

/** Catalog model as fetched. Extra keys kept. */
export const catalogModelSchema = z.looseObject({
  ...modelIdentity,
  endpoint: nestedCatalogEndpointSchema.nullable().optional(),
})

/** Catalog model as stored on a scan-artifact row (`endpoint` already stripped). */
export const scanArtifactModelSchema = z.looseObject(modelIdentity)

/** Stats-page endpoint. Extra keys kept. Nested `model` is stripped before encode. */
export const statsEndpointSchema = z.looseObject({
  id: z.string().min(1),
  provider_slug: z.string().min(1),
  provider_info: providerInfoSchema,
  pricing: pricingSchema.nullable().optional(),
  stats: z.unknown().optional(),
  statsByTier: z.unknown().optional(),
})

export const catalogModelsPageSchema = z.object({
  data: z.array(catalogModelSchema),
})

export const statsEndpointsPageSchema = z.object({
  data: z.array(statsEndpointSchema),
})

export const scanArtifactRowSchema = z.object({
  scan_at: z.string().min(1),
  model_id: z.string().min(1),
  variant: z.string().min(1),
  model: scanArtifactModelSchema,
  endpoints: z.array(statsEndpointSchema).nullable(),
})

export type CatalogModel = z.infer<typeof catalogModelSchema>
export type StatsEndpoint = z.infer<typeof statsEndpointSchema>
export type ProviderInfo = z.infer<typeof providerInfoSchema>
export type Pricing = z.infer<typeof pricingSchema>
export type ScanArtifactRow = z.infer<typeof scanArtifactRowSchema>

/** Unstored scan artifact. Ready for `artifacts.store`. */
export type ScanArtifact = {
  path: typeof SCAN_PATH
  /** `scan.{scan_at}.jsonl`. */
  artifact_id: string
  scan_at: string
  /** Uncompressed UTF-8 JSONL. */
  bytes: Uint8Array
}

/** Opaque object name for this scan. Not parsed by `artifacts`. */
export function scanArtifactId(scan_at: string) {
  return `scan.${scan_at}.jsonl`
}

/**
 * Serialize rows as UTF-8 JSONL.
 *
 * The file ends with a newline. Nested key order is not preserved.
 */
export function encodeScanArtifact(rows: ScanArtifactRow[]): Uint8Array {
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

/**
 * Parse uncompressed scan-artifact bytes into rows.
 *
 * Empty lines (including the trailing newline) are skipped. Last-write-wins
 * happens in `projections.explode`, not here.
 *
 * @throws {SyntaxError} If a line is not JSON.
 * @throws {ZodError} If a line fails `scanArtifactRowSchema`.
 */
export function parseScanArtifact(bytes: Uint8Array): ScanArtifactRow[] {
  const text = new TextDecoder().decode(bytes)
  const rows: ScanArtifactRow[] = []

  for (const line of text.split('\n')) {
    if (line.length === 0) {
      continue
    }

    rows.push(scanArtifactRowSchema.parse(JSON.parse(line)))
  }

  return rows
}
