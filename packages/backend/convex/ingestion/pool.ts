import { Workpool } from '@convex-dev/workpool'
import { ConvexError } from 'convex/values'

import { components } from '#generated/api'
import { env } from '#generated/server'

/** Default concurrent ingestion actions; raise it through the env var for large backfills. */
const DEFAULT_PARALLELISM = 16

/** Workpool warns above this and plans to reject it. */
const MAX_PARALLELISM = 100

/** Read per call, so an env change applies to the next enqueue without a deploy. */
export function ingestionParallelism(): number {
  const configured = env.ORCA_INGESTION_PARALLELISM

  if (configured === undefined || configured === '') {
    return DEFAULT_PARALLELISM
  }

  const value = Number(configured)

  if (!Number.isInteger(value) || value < 1 || value > MAX_PARALLELISM) {
    throw new ConvexError(
      `ORCA_INGESTION_PARALLELISM must be an integer from 1 to ${MAX_PARALLELISM}`,
    )
  }

  return value
}

/** Each enqueue carries the current parallelism; Workpool applies the latest value it receives. */
export function pool(): Workpool {
  return new Workpool(components.ingestionPool, {
    maxParallelism: ingestionParallelism(),
    retryActionsByDefault: true,
  })
}
