// * R2 key grammar for the observation archive. Pure: no I/O.
// *
// * Batch-major layout (see README). Dots in names do not parse — model ids contain dots; identity
// * lives in object metadata, not the key string.
import type { ArtifactName, BatchId, EndpointsQuery } from '@orca/schema/artifacts.ts'
import * as ArtifactSchema from '@orca/schema/artifacts.ts'
import * as Schema from 'effect/Schema'

const readBatchId = Schema.decodeUnknownSync(ArtifactSchema.BatchId)
const readArtifactName = Schema.decodeUnknownSync(ArtifactSchema.ArtifactName)

export const CATALOG_PREFIX = 'catalog/'
export const SUFFIX = '.json'

export const catalogKey = (batch: BatchId) => `${CATALOG_PREFIX}${batch}${SUFFIX}`

export const batchPrefix = (batch: BatchId) => `endpoints/${batch}/`

/** File name within a batch: `author.model.variant` (`/` in permaslug → `.`). */
export const artifactName = (query: EndpointsQuery) =>
  readArtifactName(`${query.permaslug.replaceAll('/', '.')}.${query.variant}`)

export const artifactKey = (batch: BatchId, name: ArtifactName) =>
  `${batchPrefix(batch)}${name}${SUFFIX}`

/** Parse the artifact name from a full object key under `prefix`. */
export const nameIn = (key: string, prefix: string) =>
  readArtifactName(key.slice(prefix.length, -SUFFIX.length))

/** Parse the batch id from a catalog object key. */
export const batchIn = (key: string) =>
  readBatchId(key.slice(CATALOG_PREFIX.length, -SUFFIX.length))
