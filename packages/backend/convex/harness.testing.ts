/// <reference types="vite/client" />
/** Shared in-memory backend. The two-dot filename excludes it from deployment. */
import * as aggregate from '@convex-dev/aggregate/test'
import * as batchWorker from '@convex-dev/batch-worker/test'
import * as workpool from '@convex-dev/workpool/test'
import discordSender from '@orca/discord-sender/test'
import { convexTest } from 'convex-test'

import schema from './schema'

const modules = import.meta.glob(['./**/*.{ts,js}', '!./**/*.{test,testing,d}.ts'])

export function setup() {
  const t = convexTest({ modules, schema, transactionLimits: true })

  workpool.register(t, 'ingestionPool')
  aggregate.register(t, 'ingestionRecordCounts')
  // Aggregate 0.3.4's helper omits its nested worker; use its pinned 0.3.3 version.
  batchWorker.register(t, 'ingestionRecordCounts/batchWorker')
  discordSender.register(t, 'discordSender')

  return t
}

export type Harness = ReturnType<typeof setup>
