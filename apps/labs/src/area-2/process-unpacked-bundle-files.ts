import { mkdir } from 'node:fs/promises'
import path from 'node:path'

import { materializeBundle } from '@orca/bundles/materialize.ts'
import type { CoreModel } from '@orca/schema/area-2-core.ts'
import { Glob } from 'bun'
import { Command } from 'commander'

import { ProductDatabase, PRODUCT_DATABASE_VERSION } from './product-db/index.ts'
import type { ProductCrawl, ProductEndpoint } from './product-db/index.ts'
import { isCrawlRequired } from './sample-rate.ts'

interface BundleFile {
  crawlId: string
  filename: string
  timestamp: number
}

const bundleFilename = /^(?<crawlId>\d+)\.json$/
const defaultDatabasePath = path.resolve(
  import.meta.dir,
  `../../../../.labs-work/databases/${PRODUCT_DATABASE_VERSION}.sqlite`,
)

const timestampForCrawlId = (crawlId: string) => {
  const timestamp = Number(crawlId)
  if (
    !Number.isSafeInteger(timestamp) ||
    String(timestamp) !== crawlId ||
    Number.isNaN(new Date(timestamp).valueOf())
  ) {
    throw new Error(`invalid Unix timestamp crawl id ${crawlId}`)
  }
  return timestamp
}

/**
 * Processes only unpacked crawl files that can advance the current projection. The persisted cursor
 * eliminates older files, while the sample rate eliminates later files in an already-selected day.
 */
export const processBundleFiles = async (
  bundleDirectory: string,
  databasePath: string,
): Promise<void> => {
  const bundleFiles: BundleFile[] = []
  for await (const filename of new Glob('*.json').scan({ cwd: bundleDirectory, onlyFiles: true })) {
    const crawlId = bundleFilename.exec(filename)?.groups?.crawlId
    if (crawlId === undefined) {
      continue
    }
    bundleFiles.push({ crawlId, filename, timestamp: timestampForCrawlId(crawlId) })
  }
  bundleFiles.sort((left, right) => left.timestamp - right.timestamp)

  await mkdir(path.dirname(databasePath), { recursive: true })
  const productDatabase = ProductDatabase.open(databasePath)

  try {
    const { latestCrawlId, policies } = productDatabase.status
    const latestTimestamp =
      latestCrawlId === undefined ? undefined : timestampForCrawlId(latestCrawlId)
    let latestSelectedCrawlId = latestCrawlId

    for (const bundleFile of bundleFiles) {
      if (
        (latestTimestamp !== undefined && bundleFile.timestamp <= latestTimestamp) ||
        !isCrawlRequired(bundleFile.crawlId, latestSelectedCrawlId, policies.sampleRate)
      ) {
        continue
      }

      const text = await Bun.file(path.join(bundleDirectory, bundleFile.filename)).text()
      let scopes
      try {
        scopes = materializeBundle(text)
      } catch {
        console.warn('skipped bundle', { crawlId: bundleFile.crawlId, reason: 'invalid' })
        continue
      }

      const models = new Map<string, CoreModel>()
      const endpoints = new Map<string, ProductEndpoint>()
      for (const scope of scopes) {
        if (
          scope.endpoints.length === 0 ||
          scope.model.output_modalities.length !== 1 ||
          scope.model.output_modalities[0] !== 'text'
        ) {
          continue
        }

        models.set(scope.model.slug, scope.model)
        for (const endpoint of scope.endpoints) {
          const { stats: _stats, ...productEndpoint } = endpoint
          endpoints.set(productEndpoint.id, {
            endpoint: productEndpoint,
            modelSlug: scope.model.slug,
          })
        }
      }

      if (endpoints.size === 0) {
        console.warn('skipped bundle', { crawlId: bundleFile.crawlId, reason: 'no-results' })
        continue
      }

      const crawl: ProductCrawl = {
        crawlId: bundleFile.crawlId,
        endpoints: [...endpoints.values()].toSorted((left, right) =>
          left.endpoint.id.localeCompare(right.endpoint.id),
        ),
        models: [...models.values()].toSorted((left, right) => left.slug.localeCompare(right.slug)),
      }
      productDatabase.applyCrawl(crawl)
      latestSelectedCrawlId = crawl.crawlId
    }
  } finally {
    productDatabase.close()
  }
}

const command = new Command()
  .name('process-unpacked-bundle-files')
  .description('Append an Area 2 product database from unpacked crawl bundle files')
  .argument('<bundle-directory>', 'directory containing unpacked <crawl-id>.json bundle files')
  .option(
    '-d, --database <path>',
    'product database SQLite file to create or append',
    defaultDatabasePath,
  )
  .action(async (bundleDirectory: string, options: { database: string }) => {
    const databasePath = path.resolve(options.database)
    await processBundleFiles(path.resolve(bundleDirectory), databasePath)
    console.info('Area 2 bundle-file processing complete')
  })

if (import.meta.main) {
  await command.parseAsync()
}
