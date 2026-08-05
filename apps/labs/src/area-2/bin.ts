import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { readBundles, validateBundle } from './bundle-reader.ts'
import type { JsonRecord } from './bundle-reader.ts'
import { materialize } from './materialize.ts'
import { ProductDatabase } from './product-database.ts'

const archivePath = path.resolve(
  import.meta.dir,
  '../../../../.labs-work/archives/2026-08-04T08-21-47Z/bundles.sqlite',
)
const outputPath = path.resolve(
  import.meta.dir,
  '../../../../.labs-work/databases/area-2-products.sqlite',
)

const isTextOutput = (model: JsonRecord) => {
  const output = model.output_modalities
  return Array.isArray(output) && output.length === 1 && output[0] === 'text'
}

await mkdir(path.dirname(outputPath), { recursive: true })

const productDatabase = ProductDatabase.open(outputPath)
let appliedCrawls = 0
let skippedBundles = 0
let modelChanges = 0
let endpointChanges = 0

try {
  for (const bundle of readBundles(archivePath, productDatabase.latestCrawlId)) {
    let batch
    try {
      const scopes = validateBundle(bundle.bytes).filter(({ model }) => isTextOutput(model))
      if (scopes.length === 0) {
        skippedBundles += 1
        continue
      }
      batch = materialize(scopes)
    } catch (error) {
      console.warn('skipped invalid bundle', { crawlId: bundle.crawlId, error })
      skippedBundles += 1
      continue
    }
    if (batch.endpoints.length === 0) {
      console.warn('skipped bundle with no text endpoints', { crawlId: bundle.crawlId })
      skippedBundles += 1
      continue
    }

    const result = productDatabase.applyCrawl({ ...batch, crawlId: bundle.crawlId })
    if (result.status === 'applied') {
      appliedCrawls += 1
      modelChanges += result.modelChanges
      endpointChanges += result.endpointChanges
    }
  }
} finally {
  productDatabase.close()
}

console.log({ appliedCrawls, endpointChanges, modelChanges, outputPath, skippedBundles })
