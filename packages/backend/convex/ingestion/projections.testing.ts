import * as R from 'remeda'

import type { Scan } from '#scans/extraction'

import {
  CURRENT_ENDPOINTS_TABLE,
  CURRENT_MODELS_TABLE,
  CURRENT_PROVIDERS_TABLE,
  CURRENT_STATS_TABLE,
} from '../catalog/tables/current'
import { EVENTS_TABLE } from '../catalog/tables/events'
import { OBSERVATIONS_TABLE } from '../catalog/tables/observations'
import { ENDPOINT_PRICES_TABLE } from '../catalog/tables/pricing'
import { ENDPOINT_STATS_TABLE } from '../catalog/tables/stats'
import type { Harness } from '../harness.testing'
import { canonicalJson } from '../products/discord/render'
import { currentTables, expectedCurrent } from './operators/current.testing'
import * as currentStats from './operators/currentStats'
import * as events from './operators/events'
import * as observations from './operators/observations'
import * as pricingHistory from './operators/pricingHistory'
import * as statsHistory from './operators/statsHistory'

const strip = <T extends { _id: unknown; _creationTime: unknown }>(doc: T) =>
  R.omit(doc, ['_id', '_creationTime'])

/** Rows in a canonical order, so stored documents and derived rows compare equal. */
const sorted = <T extends object>(rows: T[]): T[] => R.sortBy(rows, canonicalJson)

/** Every projection table, as retained rows without document metadata. */
export async function projections(t: Harness) {
  return await t.run(async (ctx) => {
    const read = async (table: Parameters<typeof ctx.db.query>[0]) => {
      const docs = await ctx.db.query(table).collect()

      return docs.map(strip)
    }

    return {
      currentStats: await read(CURRENT_STATS_TABLE),
      endpoints: await read(CURRENT_ENDPOINTS_TABLE),
      events: sorted(await read(EVENTS_TABLE)),
      models: await read(CURRENT_MODELS_TABLE),
      observations: sorted(await read(OBSERVATIONS_TABLE)),
      prices: sorted(await read(ENDPOINT_PRICES_TABLE)),
      providers: await read(CURRENT_PROVIDERS_TABLE),
      stats: sorted(await read(ENDPOINT_STATS_TABLE)),
    }
  })
}

/** The retained view a baseline at the first scan and pairs through the last must produce. */
export function referenceProjection(window: Scan[]) {
  const sources = window.map((next, index) => ({ next, previous: window[index - 1] ?? null }))
  const pairs = sources.slice(1)

  const current = (name: string) => {
    const table = currentTables.find((item) => item.name === name)

    return table === undefined ? [] : [...expectedCurrent(table, window).values()]
  }

  const latest = sources.at(-1)

  return {
    currentStats: latest === undefined ? [] : [currentStats.derive(latest)],
    endpoints: current('endpoints'),
    events: sorted(pairs.flatMap(events.derive)),
    models: current('models'),
    observations: sorted(sources.flatMap(observations.derive)),
    prices: sorted(sources.flatMap(pricingHistory.derive)),
    providers: current('providers'),
    stats: sorted(sources.flatMap(statsHistory.derive)),
  }
}

/** Current versions record which commit won; compare facts, as `expectedCurrent` does. */
export function unversioned<
  View extends {
    models: object[]
    providers: object[]
    endpoints: object[]
    currentStats: object[]
  },
>(view: View) {
  const facts = (rows: object[]) => sorted(rows.map((row) => ({ ...row, scan_at: null })))

  return {
    ...view,
    currentStats: sorted(view.currentStats),
    endpoints: facts(view.endpoints),
    models: facts(view.models),
    providers: facts(view.providers),
  }
}
