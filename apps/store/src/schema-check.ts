// * Runs a real mirrored pass through the new store schema and reports what it produces.
// * A bridge, deliberately: it feeds the *current* zod canonicalizer's output (packages/processes)
// * into the *new* effect Schema lanes (@orca/schema), which is how we find out the lane shapes
// * survive contact with real data before anything is rewired to depend on them.
// *
// * Three things it checks, each of which has been wrong before:
// * - every canonical field the lanes read actually decodes (a missing one fails with a path)
// * - every projection produces exactly the columns its lane declares, in order
// * - the bootstrap cost in D1 statements, because ⚠️ schema *width* is what couples the store's
// *   shape to a platform limit: 100 bound parameters per statement, 1,000 statements per
// *   Worker invocation.
// * Run: bun run schema-check
import { canonicalizeEndpoints } from '@orca/processes/canonicalize/endpoints.ts'
import { canonicalizeModels } from '@orca/processes/canonicalize/models.ts'
import { mirroredPasses, readPass } from '@orca/processes/canonicalize/pass.ts'
import { canonicalizeProviders } from '@orca/processes/canonicalize/providers.ts'
import { toCatalogRows } from '@orca/schema/catalog.ts'
import {
  toEndpointFeatures,
  toEndpointPrices,
  toEndpointSeries,
  toEndpointVersion,
} from '@orca/schema/endpoints.ts'
import { Sampled, Validity, columnsOf } from '@orca/schema/lanes.ts'
import { toModelParameters, toModelSeries, toModelVersion } from '@orca/schema/models.ts'
import { ObservationRow, isEvidence } from '@orca/schema/observations.ts'
import { LANES, decodePass } from '@orca/schema/pass.ts'
import { toProviderSeries, toProviderVersion } from '@orca/schema/providers.ts'
import * as Effect from 'effect/Effect'

// * D1's limits, and the only two that bind at this volume
const MAX_PARAMS = 100
const MAX_STATEMENTS = 1000

const captured_at = mirroredPasses().at(-1)
if (captured_at === undefined) {
  throw new Error('no mirrored passes — run `bun run mirror` in apps/capture first')
}
const raw = await readPass(captured_at)

// * observations don't exist as a canonical output yet — this is the shape they need to arrive in
const payload = {
  captured_at,
  catalog: raw.models,
  endpoints: canonicalizeEndpoints(raw.scopes.flatMap((scope) => scope.endpoints)),
  models: canonicalizeModels(raw.scopes.map((scope) => scope.model)),
  observations: raw.scopes.map((scope) => ({
    at: scope.at,
    error: scope.error ?? null,
    permaslug: scope.permaslug,
    slug: scope.slug,
    status: scope.status ?? null,
    variant: scope.variant ?? 'standard',
  })),
  providers: canonicalizeProviders(raw.providers),
}

const decoded = await Effect.runPromise(Effect.result(decodePass(payload)))
if (decoded._tag === 'Failure') {
  throw new Error(`canonical pass did not decode:\n${decoded.failure.message}`)
}
const pass = decoded.success

const rows: Record<string, Array<Record<string, unknown>>> = {
  catalog_versions: toCatalogRows(pass.catalog),
  endpoint_features: pass.endpoints.flatMap(toEndpointFeatures),
  endpoint_pricing: pass.endpoints.flatMap(toEndpointPrices),
  endpoint_series: pass.endpoints.flatMap(toEndpointSeries),
  endpoint_versions: pass.endpoints.map(toEndpointVersion),
  model_parameters: pass.models.flatMap(toModelParameters),
  model_series: pass.models.flatMap(toModelSeries),
  model_versions: pass.models.map(toModelVersion),
  observations: pass.observations.map((observation) => ({ captured_at, ...observation })),
  provider_series: pass.providers.flatMap(toProviderSeries),
  provider_versions: pass.providers.map(toProviderVersion),
}

// * the envelope ingest stamps on top of each projection is part of the width that counts
const envelope = (kind: string) => {
  if (kind === 'versions' || kind === 'dictionary') {
    return columnsOf(Validity).length
  }
  return kind === 'series' ? columnsOf(Sampled).length : 0
}

console.log(`pass ${captured_at}`)
console.log(
  `${pass.observations.length} observations, ${pass.observations.filter(isEvidence).length} carrying evidence\n`,
)

let statements = 0
let parameters = 0
for (const lane of LANES) {
  // * `passes` is one row written directly by ingest, not a projection of an entity
  if (lane.table === 'passes') {
    continue
  }
  const produced = rows[lane.table] ?? []
  const declared = lane.table === 'observations' ? columnsOf(ObservationRow) : lane.columns

  // * a projection drifting from its table is the failure that silently corrupts a store, so it
  // * is checked here rather than discovered as a constraint violation later
  const [sample] = produced
  if (sample !== undefined && Object.keys(sample).join(',') !== declared.join(',')) {
    throw new Error(
      `${lane.table}: projection does not match the lane\n  declared ${declared.join(',')}\n  produced ${Object.keys(sample).join(',')}`,
    )
  }

  // * a provenance column that isn't a real column would silently exclude nothing, which reads as
  // * "everything is compared" while meaning the opposite
  for (const column of lane.provenance ?? []) {
    if (!declared.includes(column)) {
      throw new Error(`${lane.table}: provenance column \`${column}\` is not a column of the lane`)
    }
  }

  const width = declared.length + envelope(lane.kind)
  const perStatement = Math.floor(MAX_PARAMS / width)
  const needed = Math.ceil(produced.length / perStatement)
  statements += needed
  parameters += produced.length * width

  const excluded = lane.provenance ?? []
  console.log(
    `  ${lane.table.padEnd(18)} ${String(produced.length).padStart(5)} rows × ${String(width).padStart(2)} cols → ${String(perStatement).padStart(2)}/stmt = ${String(needed).padStart(4)} statements${
      excluded.length > 0 ? `  (not compared: ${excluded.join(', ')})` : ''
    }`,
  )
}

console.log(`\nbootstrap: ${statements} statements for one full pass, ${parameters} parameters`)
console.log(
  statements > MAX_STATEMENTS
    ? `⚠️ over D1's ${MAX_STATEMENTS}-per-invocation ceiling — a cold load has to be chunked`
    : `within D1's ${MAX_STATEMENTS}-per-invocation ceiling`,
)
console.log(
  `floor is ${Math.ceil(parameters / MAX_PARAMS)} statements, so splitting a wide lane cannot fix ` +
    'it: the parameter count is the same and each part repeats the key.',
)

// * the open key sets the dictionary lanes exist for — worth seeing the real cardinality
const distinct = (table: string, column: string) =>
  new Set((rows[table] ?? []).map((row) => row[column])).size

console.log('\nopen key sets')
console.log(`  pricing SKUs      ${distinct('endpoint_pricing', 'sku')}`)
console.log(`  endpoint features ${distinct('endpoint_features', 'feature')}`)
console.log(`  model parameters  ${distinct('model_parameters', 'parameter')}`)
console.log(
  `  prices not parsing as a number ${(rows.endpoint_pricing ?? []).filter((row) => row.value_num === null).length}`,
)
