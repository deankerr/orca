import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'

import { internal } from '../../_generated/api'
import { internalAction, internalMutation, internalQuery } from '../../_generated/server'
import { V4_ENDPOINT_LISTINGS_TABLE } from '../history/listings/table'
import { V4_INGESTIONS_TABLE } from '../ingestion/table'
import { loadArtifact } from '../scan/artifacts'
import { extractScan } from '../scan/extract'
import { assertScanAt } from '../scan/time'
import { V4_CURRENT_ENDPOINTS_TABLE } from './endpoints/table'
import { V4_CURRENT_MODELS_TABLE } from './models/table'
import { V4_CURRENT_PROVIDERS_TABLE } from './providers/table'

const tables = {
  model: V4_CURRENT_MODELS_TABLE,
  provider: V4_CURRENT_PROVIDERS_TABLE,
  endpoint: V4_CURRENT_ENDPOINTS_TABLE,
} as const

const kind = v.union(v.literal('model'), v.literal('provider'), v.literal('endpoint'))

// Verified against both artifacts around each free variant's first loss of all endpoints.
// The scanner emits a standard identity when the upstream catalog's endpoint becomes null.
// These are exact standard-ID observations, not the earlier free variant's discovery dates.
const historicalModels: Readonly<Record<string, string>> = {
  'baidu/cobuddy': '2026-05-27T14:50:00.123Z',
  'dots-studio/dots-3-note-preview': '2026-08-14T06:30:04.081Z',
  'featherless/qwerky-72b': '2025-08-26T13:12:23.268Z',
  'google/gemini-2.0-flash-exp': '2026-01-29T16:50:00.306Z',
  'google/gemma-3n-e2b-it': '2026-05-05T20:50:00.128Z',
  'inclusionai/ling-3.0-tiny': '2026-08-13T07:30:04.445Z',
  'liquid/lfm-2.5-1.2b-instruct': '2026-07-13T14:50:00.209Z',
  'liquid/lfm-2.5-1.2b-thinking': '2026-07-13T14:50:00.209Z',
  'liquid/lfm-2.5-2.6b': '2026-08-12T18:30:04.164Z',
  'qwen/qwen3.6-plus-preview': '2026-04-03T00:50:00.124Z',
  'sarvamai/sarvam-m': '2025-09-02T15:11:38.534Z',
}

const decision = v.object({
  entity_id: v.string(),
  scan_at: v.string(),
  from_scan_at: v.union(v.string(), v.null()),
  source: v.union(
    v.literal('existing'),
    v.literal('baseline'),
    v.literal('listings'),
    v.literal('verified_artifact'),
    v.literal('unresolved'),
  ),
  invalid: v.boolean(),
})

const summary = v.object({
  kind,
  examined: v.number(),
  existing: v.number(),
  baseline: v.number(),
  listings: v.number(),
  verified_artifact: v.number(),
  patched: v.number(),
  issues: v.array(decision),
})

/** Resolve the deployment's retained horizon, not the earliest object in shared source storage. */
export const baseline = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const first = await ctx.db.query(V4_INGESTIONS_TABLE).withIndex('by_scan_at').first()

    if (first === null) {
      throw new ConvexError('Backfill requires an accepted ingestion to identify the baseline')
    }

    return assertScanAt(first.from_scan_at)
  },
})

/** One bounded transaction; dry-run returns the same decisions without patching documents. */
export const batch = internalMutation({
  args: {
    kind,
    baseline_scan_at: v.string(),
    baseline_models: v.array(v.string()),
    cursor: v.union(v.string(), v.null()),
    apply: v.boolean(),
  },
  returns: v.object({ done: v.boolean(), cursor: v.string(), decisions: v.array(decision) }),
  handler: async (ctx, args) => {
    const baselineAt = assertScanAt(args.baseline_scan_at)
    const baselineModels = new Set(args.baseline_models)
    const table = tables[args.kind]
    const page = await ctx.db
      .query(table)
      .withIndex('by_creation_time')
      .paginate({ cursor: args.cursor, numItems: 50, maximumBytesRead: 1_000_000 })
    const decisions: Infer<typeof decision>[] = []

    for (const row of page.page) {
      const id =
        'endpoint_id' in row
          ? row.endpoint_id
          : 'provider_id' in row
            ? row.provider_id
            : row.model_id
      let from = row.from_scan_at ?? null
      let source: Infer<typeof decision>['source'] = 'existing'

      if (from === null) {
        if (args.kind === 'model' && baselineModels.has(id)) {
          from = baselineAt
          source = 'baseline'
        } else {
          const listings = ctx.db.query(V4_ENDPOINT_LISTINGS_TABLE)
          const first = await (
            args.kind === 'model'
              ? listings.withIndex('by_model_id_and_scan_at', (q) => q.eq('model_id', id))
              : args.kind === 'provider'
                ? listings.withIndex('by_provider_id_and_scan_at', (q) => q.eq('provider_id', id))
                : listings.withIndex('by_endpoint_id_and_scan_at', (q) => q.eq('endpoint_id', id))
          ).first()

          // ponytail: first model listing may follow catalog discovery; replay source scans if exactness is needed.
          from = first?.scan_at ?? null
          source = from === null ? 'unresolved' : 'listings'

          if (args.kind === 'model' && Object.hasOwn(historicalModels, id)) {
            const verified = historicalModels[id]

            if (from === null || verified < from) {
              from = verified
              source = 'verified_artifact'
            }
          }
        }
      }

      if (from !== null) {
        assertScanAt(from)
      }

      const invalid = from !== null && (from < baselineAt || from > row.scan_at)
      decisions.push({ entity_id: id, scan_at: row.scan_at, from_scan_at: from, source, invalid })

      // Read and patch in the same transaction: concurrent ingestion retries preserve this value.
      if (args.apply && source !== 'existing' && from !== null && !invalid) {
        await ctx.db.patch(table, row._id, { from_scan_at: from })
      }
    }

    return { done: page.isDone, cursor: page.continueCursor, decisions }
  },
})

/** One-off operator runner. Default is dry-run; restarting preserves every already-populated value. */
export const run = internalAction({
  args: { apply: v.optional(v.boolean()) },
  returns: v.object({ apply: v.boolean(), baseline_scan_at: v.string(), tables: v.array(summary) }),
  handler: async (
    ctx,
    { apply = false },
  ): Promise<{ apply: boolean; baseline_scan_at: string; tables: Infer<typeof summary>[] }> => {
    const baselineAt = await ctx.runQuery(internal.v4.catalog.backfill.baseline, {})
    const artifact = await loadArtifact(ctx, baselineAt)
    const baselineModels = [...extractScan(baselineAt, artifact.entries).models.keys()]
    const results: Infer<typeof summary>[] = []

    for (const entityKind of ['model', 'provider', 'endpoint'] as const) {
      const result: Infer<typeof summary> = {
        kind: entityKind,
        examined: 0,
        existing: 0,
        baseline: 0,
        listings: 0,
        verified_artifact: 0,
        patched: 0,
        issues: [],
      }
      let cursor: string | null = null

      for (;;) {
        const page: { done: boolean; cursor: string; decisions: Infer<typeof decision>[] } =
          await ctx.runMutation(internal.v4.catalog.backfill.batch, {
            kind: entityKind,
            baseline_scan_at: baselineAt,
            baseline_models: baselineModels,
            cursor,
            apply,
          })

        for (const item of page.decisions) {
          result.examined += 1

          if (item.invalid || item.source === 'unresolved') {
            result.issues.push(item)
          } else {
            result[item.source] += 1

            if (apply && item.source !== 'existing') {
              result.patched += 1
            }
          }
        }

        if (page.done) {
          break
        }

        const { cursor: nextCursor } = page
        cursor = nextCursor
      }

      results.push(result)
    }

    return { apply, baseline_scan_at: baselineAt, tables: results }
  },
})
