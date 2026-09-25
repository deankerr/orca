import { ConvexError } from 'convex/values'

import type { ActionCtx } from '../../_generated/server'
import * as listings from '../history/listings'
import * as pricing from '../history/pricing'
import * as currentStats from '../stats/current'
import type { ModuleStep, ObservationPair } from './step'
import type { ModuleName } from './table'

type Module = {
  process: (ctx: ActionCtx, pair: ObservationPair, step: ModuleStep) => Promise<void>
  /** Replay every declared pair, or only the latest when output ignores the previous scan. */
  catchUp: 'replay' | 'latest'
}

/** Modules available to routine ingestion and manual catch-up; unlisted names stay dormant. */
const modules: Partial<Record<ModuleName, Module>> = {
  pricing: { process: pricing.process, catchUp: 'replay' },
  listings: { process: listings.process, catchUp: 'replay' },
  current_stats: { process: currentStats.process, catchUp: 'latest' },
}

export function getModule(name: ModuleName): Module {
  const definition = modules[name]
  if (definition === undefined) {
    throw new ConvexError({ message: 'Module is not registered', module: name })
  }
  return definition
}
