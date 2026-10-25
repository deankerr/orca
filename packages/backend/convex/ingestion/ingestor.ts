import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx, MutationCtx } from '#generated/server'

import type { IngestInput } from './input'
import { removeResult } from './results'
import type { CommitResult, RemoveResult, IngestResult, RemovalResult } from './results'
import { PROCESS_COMMITS_TABLE } from './tables'

export type Ingestor = {
  (ctx: ActionCtx, input: IngestInput): Promise<IngestResult>
  readonly process: string
  remove: (ctx: ActionCtx, args: { scan_at: string }) => Promise<RemovalResult>
}

type Prepare<Prepared> = (ctx: ActionCtx, input: IngestInput) => Prepared | Promise<Prepared>

type Remove = (ctx: ActionCtx, args: { scan_at: string; process: string }) => Promise<RemoveResult>

/**
 * Current views omit `remove`: the default releases only the receipt. Only displaced
 * baselines are withdrawn so far, and their scan remains an input of the displacing
 * pair, so current values versioned there stay supported by source evidence.
 */
const releaseReceipt: Remove = async (ctx, args) =>
  await ctx.runMutation(internal.ingestion.ingestor.release, args)

export function createIngestor<Prepared extends object>({
  process,
  prepare,
  write,
  remove = releaseReceipt,
}: {
  process: string
  prepare: Prepare<Prepared>
  write: (ctx: ActionCtx, prepared: Prepared & { process: string }) => Promise<CommitResult>
  remove?: Remove
}): Ingestor {
  const ingest = async (ctx: ActionCtx, input: IngestInput): Promise<IngestResult> => {
    let prepared: Prepared

    try {
      prepared = await prepare(ctx, input)
    } catch (error) {
      return { error: errorDetails(error), kind: 'failed', process, stage: 'prepare' }
    }

    try {
      const kind = await write(ctx, { ...prepared, process })

      return { kind, process }
    } catch (error) {
      return { error: errorDetails(error), kind: 'failed', process, stage: 'write' }
    }
  }

  return Object.assign(ingest, {
    process,
    async remove(ctx: ActionCtx, args: { scan_at: string }): Promise<RemovalResult> {
      try {
        const kind = await remove(ctx, { ...args, process })

        return { kind, process }
      } catch (error) {
        return { error: errorDetails(error), kind: 'failed', process, stage: 'remove' }
      }
    },
  })
}

export const release = internalMutation({
  args: { process: v.string(), scan_at: v.string() },
  handler: async (ctx, { scan_at, process }) =>
    await removeProcess(ctx, scan_at, process, async () => {
      // Current rows stay; only the receipt is released.
    }),
  returns: removeResult,
})

/**
 * Output and its receipt commit together; write failures must escape to roll back both.
 * A retry can be assigned more output than an earlier attempt committed, so a receipt with
 * lower `coverage` is widened by writing again; such writes must be idempotent.
 */
export async function commitProcess(
  ctx: MutationCtx,
  scan_at: string,
  process: string,
  write: () => Promise<void>,
  coverage = 0,
): Promise<CommitResult> {
  const committed = await receipt(ctx, scan_at, process)

  if (committed !== null && (committed.coverage ?? 0) >= coverage) {
    return 'already_committed'
  }

  await write()
  await (committed === null
    ? ctx.db.insert(PROCESS_COMMITS_TABLE, { coverage, process, scan_at })
    : ctx.db.patch(PROCESS_COMMITS_TABLE, committed._id, { coverage }))

  return 'committed'
}

/** Remove output and its receipt together; a later record may commit the scan again. */
export async function removeProcess(
  ctx: MutationCtx,
  scan_at: string,
  process: string,
  remove: () => Promise<void>,
): Promise<RemoveResult> {
  const committed = await receipt(ctx, scan_at, process)

  if (committed === null) {
    return 'already_removed'
  }

  await remove()
  await ctx.db.delete(PROCESS_COMMITS_TABLE, committed._id)

  return 'removed'
}

async function receipt(ctx: MutationCtx, scan_at: string, process: string) {
  return await ctx.db
    .query(PROCESS_COMMITS_TABLE)
    .withIndex('by_scan_at_and_process', (q) => q.eq('scan_at', scan_at).eq('process', process))
    .unique()
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Catch clauses bind unknown; this records whatever was thrown.
function errorDetails(error: unknown) {
  return error instanceof Error
    ? { message: error.message, name: error.name, stack: error.stack }
    : { message: String(error), name: 'Error' }
}
