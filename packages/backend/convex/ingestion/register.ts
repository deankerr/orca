import { ConvexError, v } from 'convex/values'
import { z } from 'zod'

import { internal } from '#generated/api'
import type { Doc, Id } from '#generated/dataModel'
import { env, internalAction, internalMutation } from '#generated/server'
import type { MutationCtx } from '#generated/server'
import * as scans from '#scans'

import { pool } from './pool'
import { latestRecord } from './state'
import { REGISTRATIONS_TABLE, registrationId, scanSelection } from './table'
import type { RegistrationId } from './table'

/** Register a baseline on a fresh timeline; otherwise resume before selecting the next scan. */
export const next = internalAction({
  args: { start_at: v.optional(v.string()) },
  returns: v.union(v.null(), v.id(REGISTRATIONS_TABLE)),
  handler: async (ctx, { start_at }): Promise<Id<typeof REGISTRATIONS_TABLE> | null> => {
    const latest: Doc<typeof REGISTRATIONS_TABLE> | null = await ctx.runQuery(
      internal.ingestion.state.latest,
      {},
    )

    if (latest !== null && start_at !== undefined) {
      throw new ConvexError('start_at requires a fresh timeline; omit it to resume')
    }

    if (latest !== null && latest.progress.kind !== 'complete') {
      await ctx.runMutation(internal.ingestion.register.recover, {})
      return latest._id
    }

    const startAt =
      start_at === undefined
        ? null
        : z
            .union([z.iso.date(), z.iso.datetime({ offset: true })])
            .transform((value) => new Date(value).toISOString())
            .parse(start_at)
    const scan_at =
      latest === null
        ? await scans.firstAtOrAfter(ctx, startAt)
        : await scans.nextAfter(ctx, latest.scan_at)

    if (scan_at === null && startAt !== null) {
      throw new ConvexError({
        message: 'No baseline capture at or after start_at; retry when available',
        start_at: startAt,
      })
    }

    return scan_at === null
      ? null
      : await ctx.runMutation(internal.ingestion.register.scan, {
          from_scan_at: latest?.scan_at ?? null,
          scan_at,
        })
  },
})

/** Register selected scans and queue their ingestion atomically. */
export const scan = internalMutation({
  args: scanSelection.fields,
  returns: registrationId,
  handler: async (ctx, selection) => {
    if (selection.from_scan_at !== null && selection.scan_at <= selection.from_scan_at) {
      throw new ConvexError('Scan pair must move forward in canonical time')
    }

    const existing = await ctx.db
      .query(REGISTRATIONS_TABLE)
      .withIndex('by_scan_at', (q) => q.eq('scan_at', selection.scan_at))
      .unique()

    if (existing !== null) {
      if (existing.from_scan_at !== selection.from_scan_at) {
        throw new ConvexError('Selected scans differ from the registration')
      }

      if (existing.progress.kind === 'pending') {
        await enqueue(ctx, existing._id)
      }

      return existing._id
    }

    const previous = await latestRecord(ctx)

    if (previous !== null && previous.progress.kind !== 'complete') {
      throw new ConvexError('Complete the current registration before admitting another')
    }

    if (selection.from_scan_at !== (previous?.scan_at ?? null)) {
      throw new ConvexError('Source selection does not follow the completed timeline')
    }

    const id = await ctx.db.insert(REGISTRATIONS_TABLE, {
      ...selection,
      progress: { kind: 'pending', completed: [] },
    })

    await enqueue(ctx, id)
    return id
  },
})

async function enqueue(ctx: MutationCtx, registration_id: RegistrationId) {
  await pool.enqueueAction(ctx, internal.ingestion.ingest.run, { registration_id })
}

/** Repeated triggers may enqueue overlapping attempts; committed progress prevents duplicate output. */
export const recover = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const registration = await latestRecord(ctx)

    if (registration?.progress.kind === 'pending') {
      await enqueue(ctx, registration._id)
    }

    return null
  },
})

/** Gate cron admission; manual invocations and continuations proceed independently. */
export const scheduled = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (env.ORCA_INGESTION_CRON_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.ingestion.register.next, {})
    }

    return null
  },
})
