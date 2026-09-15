import { deepStrictEqual } from 'node:assert'
import path from 'node:path'

import { applyChangeset, revertChangeset } from 'json-diff-ts'
import type { IChange } from 'json-diff-ts'
import { z } from 'zod'

import { compareScanProjections, ScanProjection } from '../../backend/convex/projections'

const COLLECTIONS = ['models', 'endpoints', 'providers'] as const

async function load(filePath: string) {
  const text = await Bun.file(filePath).text()
  const entries: unknown[] = text
    .trim()
    .split('\n')
    .map((line): unknown => JSON.parse(line))
  const { scan_at } = z.object({ scan_at: z.string() }).parse(entries[0])
  return {
    projection: ScanProjection.parse({ entries, id: path.basename(filePath), scan_at }),
    sourceBytes: Buffer.byteLength(text),
  }
}

function countLeaves(changes: IChange[]): number {
  return changes.reduce(
    (count, change) => count + (change.changes ? countLeaves(change.changes) : 1),
    0,
  )
}

const [fromPath, toPath, outputDirectory] = z
  .tuple([z.string().min(1), z.string().min(1), z.string().min(1)])
  .parse(Bun.argv.slice(2))

const [before, after] = await Promise.all([load(fromPath), load(toPath)])
const { previous, next, document } = compareScanProjections(before.projection, after.projection)
const { changes } = document

// Exercise the production document in both directions, including literal dotted keys and arrays.
deepStrictEqual(applyChangeset(structuredClone(previous.catalog), changes), next.catalog)
deepStrictEqual(revertChangeset(structuredClone(next.catalog), changes), previous.catalog)

const owners = changes.flatMap((group) =>
  (group.changes ?? []).map((owner) => ({
    collection: group.key,
    id: owner.key,
    leafOperations: countLeaves([owner]),
    operation: owner.type,
  })),
)

const summary = {
  bytes: {
    document: Buffer.byteLength(JSON.stringify(document)),
    projectionAfter: Buffer.byteLength(JSON.stringify(next.catalog)),
    projectionBefore: Buffer.byteLength(JSON.stringify(previous.catalog)),
    sourceAfter: after.sourceBytes,
    sourceBefore: before.sourceBytes,
  },
  changedOwners: owners.length,
  counts: Object.fromEntries(
    COLLECTIONS.map((collection) => [
      collection,
      {
        after: Object.keys(next.catalog[collection]).length,
        before: Object.keys(previous.catalog[collection]).length,
      },
    ]),
  ),
  from: document.from,
  leafOperations: countLeaves(changes),
  owners,
  roundTrip: 'apply and revert match projected inputs',
  to: document.to,
}

await Promise.all(
  Object.entries({
    'after.projection.json': next.catalog,
    'before.projection.json': previous.catalog,
    'change-document.json': document,
    'summary.json': summary,
  }).map(
    async ([name, value]) =>
      await Bun.write(path.join(outputDirectory, name), `${JSON.stringify(value, null, 2)}\n`),
  ),
)

const { owners: _owners, ...overview } = summary
console.log(JSON.stringify(overview, null, 2))
