import { literals } from 'convex-helpers/validators'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '#generated/api'
import { internalAction, internalMutation, internalQuery } from '#generated/server'
import type { QueryCtx } from '#generated/server'
import * as scans from '#scans'

import { planRegister } from './decide'
import type { Edges } from './decide'
import { writeRecords } from './records'
import { kickoff } from './sync'
import { INGESTION_RECORDS_TABLE, INGESTION_TARGET_TABLE, ingestionTargetRange } from './tables'

/** Maximum new pairs per register step. */
const REGISTER_BATCH = 24

const edgesValidator = v.object({
  earliest: v.union(v.null(), v.object({ from_scan_at: v.string(), scan_at: v.string() })),
  latest: v.union(v.null(), v.string()),
})

const step = literals('bootstrap', 'forward', 'backward', 'baseline', 'idle', 'overtaken')

/** One register step: select at most one batch, commit it, and finish. */
export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<Infer<typeof step>> => {
    const state = await ctx.runQuery(internal.ingestion.register.read, {})

    const plan = await planRegister(
      state,
      async (listing) => await scans.times(ctx, listing),
      REGISTER_BATCH,
    )

    if (plan.kind === 'idle') {
      return plan.kind
    }

    const registered =
      plan.kind === 'baseline'
        ? await ctx.runMutation(internal.ingestion.register.commitBaseline, {
            edges: state.edges,
            scan_at: plan.scan_at,
          })
        : await ctx.runMutation(internal.ingestion.register.commitPairs, {
            edges: state.edges,
            pairs: plan.pairs,
          })

    return registered ? plan.kind : 'overtaken'
  },
  returns: step,
})

/** The target, registry edges, and whether a baseline already holds the earliest input scan. */
export const read = internalQuery({
  args: {},
  handler: async (ctx) => {
    const target = await ctx.db.query(INGESTION_TARGET_TABLE).unique()
    const edges = await readEdges(ctx)

    const baseline =
      edges.earliest !== null &&
      (await ctx.db
        .query(INGESTION_RECORDS_TABLE)
        .withIndex('by_kind_and_scan_at', (q) =>
          q.eq('kind', 'baseline').eq('scan_at', edges.earliest?.from_scan_at ?? ''),
        )
        .first()) !== null

    return {
      baseline,
      edges,
      target: target === null ? null : { end_at: target.end_at, start_at: target.start_at },
    }
  },
  returns: v.object({
    baseline: v.boolean(),
    edges: edgesValidator,
    target: v.union(v.null(), ingestionTargetRange),
  }),
})

/** Commit pairs only if the edges they extend are unchanged; an overtaken step registers nothing. */
export const commitPairs = internalMutation({
  args: {
    edges: edgesValidator,
    pairs: v.array(
      v.object({ alerts: v.boolean(), from_scan_at: v.string(), scan_at: v.string() }),
    ),
  },
  handler: async (ctx, { edges, pairs }) => {
    if (!sameEdges(await readEdges(ctx), edges)) {
      return false
    }

    await writeRecords(ctx, async (records) => {
      await Promise.all(
        pairs.map(
          async (pair) => await records.insert({ kind: 'pair', ...pair, state: 'pending' }),
        ),
      )
    })

    // Registration repeats until idle and makes new records candidates for the queue worker.
    await kickoff(ctx)

    return true
  },
  returns: v.boolean(),
})

export const commitBaseline = internalMutation({
  args: { edges: edgesValidator, scan_at: v.string() },
  handler: async (ctx, { edges, scan_at }) => {
    const current = await readEdges(ctx)

    const existing = await ctx.db
      .query(INGESTION_RECORDS_TABLE)
      .withIndex('by_kind_and_scan_at', (q) => q.eq('kind', 'baseline').eq('scan_at', scan_at))
      .first()

    if (
      !sameEdges(current, edges) ||
      current.earliest?.from_scan_at !== scan_at ||
      existing !== null
    ) {
      return false
    }

    await writeRecords(
      ctx,
      async (records) =>
        await records.insert({
          alerts: false,
          from_scan_at: null,
          kind: 'baseline',
          scan_at,
          state: 'pending',
        }),
    )
    await kickoff(ctx)

    return true
  },
  returns: v.boolean(),
})

async function readEdges(ctx: QueryCtx): Promise<Edges> {
  const pairs = () =>
    ctx.db
      .query(INGESTION_RECORDS_TABLE)
      .withIndex('by_kind_and_scan_at', (q) => q.eq('kind', 'pair'))

  const latest = await pairs().order('desc').first()
  const earliest = await pairs().order('asc').first()

  return {
    earliest:
      earliest?.from_scan_at === null || earliest === null
        ? null
        : { from_scan_at: earliest.from_scan_at, scan_at: earliest.scan_at },
    latest: latest?.scan_at ?? null,
  }
}

function sameEdges(a: Edges, b: Edges): boolean {
  return a.latest === b.latest && a.earliest?.scan_at === b.earliest?.scan_at
}
