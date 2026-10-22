/**
 * Shared `convex-test` deployment for backend tests. Its name has two dots, so Convex
 * never deploys it; only tests import it.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import componentSchema from '@orca/discord-sender/schema'
import { convexTest } from 'convex-test'
import type { GenericSchema, SchemaDefinition } from 'convex/server'

import schema from './schema'

const senderRoot = path.dirname(fileURLToPath(import.meta.resolve('@orca/discord-sender/schema')))
const aggregateRoot = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('@convex-dev/aggregate/package.json'))),
  'src/component',
)
const workpoolRoot = path.join(
  path.dirname(fileURLToPath(import.meta.resolve('@convex-dev/workpool/package.json'))),
  'src/component',
)
const batchRoot = path.join(
  path.dirname(
    createRequire(path.join(workpoolRoot, 'schema.ts')).resolve(
      '@convex-dev/batch-worker/package.json',
    ),
  ),
  'src/component',
)

async function loadSchema(root: string) {
  const loaded: unknown = await import(path.join(root, 'schema.ts'))
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Installed component schemas are loaded dynamically because their bundled test helpers require Vite.
  return (loaded as { default: SchemaDefinition<GenericSchema, boolean> }).default
}

const aggregateSchema = await loadSchema(aggregateRoot)
/** The aggregate pins a different batch worker version from Workpool's. */
const aggregateBatchRoot = path.join(
  path.dirname(
    createRequire(path.join(aggregateRoot, 'schema.ts')).resolve(
      '@convex-dev/batch-worker/package.json',
    ),
  ),
  'src/component',
)

const workpoolSchema = await loadSchema(workpoolRoot)
const batchSchema = await loadSchema(batchRoot)
const aggregateBatchSchema = await loadSchema(aggregateBatchRoot)

function modules(root: string) {
  return Object.fromEntries(
    [...new Bun.Glob('**/*.{ts,js}').scanSync({ absolute: true, cwd: root })]
      .filter((file) => !/\.(?:test|testing|d)\.ts$/u.test(file))
      .map((file) => [file, async (): Promise<unknown> => await import(file)]),
  )
}

/** The backend with its installed components, backed by an in-memory database. */
export function setup() {
  const t = convexTest({ schema, modules: modules(import.meta.dir), transactionLimits: true })

  t.registerComponent('ingestionPool', workpoolSchema, modules(workpoolRoot))
  t.registerComponent('ingestionPool/batchWorker', batchSchema, modules(batchRoot))
  t.registerComponent('ingestionRecordCounts', aggregateSchema, modules(aggregateRoot))
  t.registerComponent(
    'ingestionRecordCounts/batchWorker',
    aggregateBatchSchema,
    modules(aggregateBatchRoot),
  )
  t.registerComponent('discordSender', componentSchema, modules(senderRoot))
  t.registerComponent('discordSender/workpool', workpoolSchema, modules(workpoolRoot))
  t.registerComponent('discordSender/workpool/batchWorker', batchSchema, modules(batchRoot))

  return t
}

export type Harness = ReturnType<typeof setup>
