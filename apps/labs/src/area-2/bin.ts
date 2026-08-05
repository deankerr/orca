import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { readBundles, validateBundle } from './bundle-reader.ts'
import type { JsonRecord, RawModelScope } from './bundle-reader.ts'
import { materialize } from './materialize.ts'
import { selectHistoricalCrawls } from './precision.ts'
import type { HistoricalPrecision } from './precision.ts'
import { ProductDatabase } from './product-database.ts'

const archivePath = path.resolve(
  import.meta.dir,
  '../../../../.labs-work/archives/2026-08-04T08-21-47Z/bundles.sqlite',
)
const isTextOutput = (model: JsonRecord) => {
  const output = model.output_modalities
  return Array.isArray(output) && output.length === 1 && output[0] === 'text'
}

const parseHistoricalPrecision = (arguments_: readonly string[]): HistoricalPrecision => {
  if (arguments_.length === 0) {
    return 'daily'
  }
  if (
    arguments_.length === 2 &&
    arguments_[0] === '--precision' &&
    (arguments_[1] === 'daily' || arguments_[1] === 'full')
  ) {
    return arguments_[1]
  }
  throw new Error('usage: bun apps/labs/src/area-2/bin.ts [--precision daily|full]')
}

interface AcceptedBundle {
  readonly crawlId: string
  readonly scopes: readonly RawModelScope[]
}

interface ReplayCounters {
  acceptedBundles: number
  appliedCrawls: number
  endpointChanges: number
  modelChanges: number
  selectedCrawls: number
  skippedBundles: number
  sourceBundles: number
}

const logProgress = (phase: string, counters: ReplayCounters, startedAt: number) => {
  console.info(`Area 2 replay ${phase} progress`, {
    acceptedBundles: counters.acceptedBundles,
    appliedCrawls: counters.appliedCrawls,
    elapsedSeconds: Math.round((performance.now() - startedAt) / 1000),
    endpointChanges: counters.endpointChanges,
    modelChanges: counters.modelChanges,
    selectedCrawls: counters.selectedCrawls,
    skippedBundles: counters.skippedBundles,
    sourceBundles: counters.sourceBundles,
  })
}

/**
 * Reads the valid text-output candidates that can participate in historical precision selection.
 *
 * @yields {AcceptedBundle} One structurally accepted raw bundle at a time, in archive order.
 */
function* readAcceptedBundles(
  sourceArchivePath: string,
  counters: ReplayCounters,
  startedAt: number,
): Generator<AcceptedBundle, void, undefined> {
  for (const bundle of readBundles(sourceArchivePath)) {
    counters.sourceBundles += 1
    let scopes: readonly RawModelScope[]
    try {
      scopes = validateBundle(bundle.bytes).filter(({ model }) => isTextOutput(model))
    } catch (error) {
      console.warn('skipped invalid bundle', { crawlId: bundle.crawlId, error })
      counters.skippedBundles += 1
      continue
    }
    if (scopes.length === 0) {
      counters.skippedBundles += 1
      continue
    }
    counters.acceptedBundles += 1
    yield { crawlId: bundle.crawlId, scopes }
    if (counters.sourceBundles % 500 === 0) {
      logProgress('source', counters, startedAt)
    }
  }
}

const historicalPrecision = parseHistoricalPrecision(process.argv.slice(2))
const outputPath = path.resolve(
  import.meta.dir,
  `../../../../.labs-work/databases/area-2-products-v3-${historicalPrecision}-pricing-revisions.sqlite`,
)

await mkdir(path.dirname(outputPath), { recursive: true })
await Promise.all([
  rm(outputPath, { force: true }),
  rm(`${outputPath}-shm`, { force: true }),
  rm(`${outputPath}-wal`, { force: true }),
])

const startedAt = performance.now()
const counters: ReplayCounters = {
  acceptedBundles: 0,
  appliedCrawls: 0,
  endpointChanges: 0,
  modelChanges: 0,
  selectedCrawls: 0,
  skippedBundles: 0,
  sourceBundles: 0,
}

console.info('rebuilding Area 2 product database', {
  archivePath,
  historicalPrecision,
  outputPath,
})

const productDatabase = ProductDatabase.open(outputPath, historicalPrecision)
try {
  for (const bundle of selectHistoricalCrawls(
    readAcceptedBundles(archivePath, counters, startedAt),
    historicalPrecision,
  )) {
    counters.selectedCrawls += 1
    let batch
    try {
      batch = materialize(bundle.scopes)
    } catch (error) {
      console.warn('skipped invalid selected bundle', { crawlId: bundle.crawlId, error })
      counters.skippedBundles += 1
      continue
    }
    if (batch.endpoints.length === 0) {
      console.warn('skipped selected bundle with no text endpoints', { crawlId: bundle.crawlId })
      counters.skippedBundles += 1
      continue
    }

    const result = productDatabase.applyCrawl({ ...batch, crawlId: bundle.crawlId })
    if (result.status === 'applied') {
      counters.appliedCrawls += 1
      counters.modelChanges += result.modelChanges
      counters.endpointChanges += result.endpointChanges
    }
    if (counters.selectedCrawls % 25 === 0) {
      logProgress('projection', counters, startedAt)
    }
  }
} finally {
  productDatabase.close()
}

console.info('Area 2 product database ready', { ...counters, historicalPrecision, outputPath })
