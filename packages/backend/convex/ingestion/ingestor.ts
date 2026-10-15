import type { ActionCtx, MutationCtx } from '#generated/server'

import type { ScanPair } from './input'
import type { CommitResult, RemoveResult, IngestResult, RemovalResult } from './results'
import { PROCESS_COMMITS_TABLE } from './tables'

export type Ingestor = {
  (ctx: ActionCtx, args: ScanPair): Promise<IngestResult>
  readonly process: string
  remove: (ctx: ActionCtx, args: { scan_at: string }) => Promise<RemovalResult>
}

type Prepare<Prepared> = (ctx: ActionCtx, args: ScanPair) => Prepared | Promise<Prepared>

export function createIngestor<Prepared extends object>({
  process,
  prepare,
  baseline,
  write,
  remove,
}: {
  process: string
  prepare: Prepare<Prepared>
  baseline?: Prepare<Prepared>
  write: (ctx: ActionCtx, prepared: Prepared & { process: string }) => Promise<CommitResult>
  remove?: (ctx: ActionCtx, args: { scan_at: string; process: string }) => Promise<RemoveResult>
}): Ingestor {
  const ingest = async (ctx: ActionCtx, args: ScanPair): Promise<IngestResult> => {
    let prepared: Prepared

    try {
      const prepareScan = args.previous.scan_at === null ? (baseline ?? prepare) : prepare

      prepared = await prepareScan(ctx, args)
    } catch (error) {
      return { process, kind: 'failed', stage: 'prepare', error: errorDetails(error) }
    }

    try {
      const kind = await write(ctx, { ...prepared, process })

      return { process, kind }
    } catch (error) {
      return { process, kind: 'failed', stage: 'write', error: errorDetails(error) }
    }
  }

  return Object.assign(ingest, {
    process,
    async remove(ctx: ActionCtx, args: { scan_at: string }): Promise<RemovalResult> {
      if (remove === undefined) {
        return { process, kind: 'unsupported' }
      }

      try {
        const kind = await remove(ctx, { ...args, process })

        return { process, kind }
      } catch (error) {
        return { process, kind: 'failed', stage: 'remove', error: errorDetails(error) }
      }
    },
  })
}

/** Output and its receipt commit together; write failures must escape to roll back both. */
export async function commitProcess(
  ctx: MutationCtx,
  scan_at: string,
  process: string,
  write: () => Promise<void>,
): Promise<CommitResult> {
  const committed = await ctx.db
    .query(PROCESS_COMMITS_TABLE)
    .withIndex('by_scan_at_and_process', (q) => q.eq('scan_at', scan_at).eq('process', process))
    .unique()

  if (committed !== null && committed.removed_at === undefined) {
    return 'already_committed'
  }

  await write()

  await (committed === null
    ? ctx.db.insert(PROCESS_COMMITS_TABLE, { scan_at, process })
    : ctx.db.patch(PROCESS_COMMITS_TABLE, committed._id, { removed_at: undefined }))

  return 'committed'
}

/** Remove output and reopen its receipt together; a later ingestion may commit it again. */
export async function removeProcess(
  ctx: MutationCtx,
  scan_at: string,
  process: string,
  remove: () => Promise<void>,
): Promise<RemoveResult> {
  const committed = await ctx.db
    .query(PROCESS_COMMITS_TABLE)
    .withIndex('by_scan_at_and_process', (q) => q.eq('scan_at', scan_at).eq('process', process))
    .unique()

  if (committed === null || committed.removed_at !== undefined) {
    return 'already_removed'
  }

  await remove()

  await ctx.db.patch(PROCESS_COMMITS_TABLE, committed._id, { removed_at: Date.now() })

  return 'removed'
}

function errorDetails(error: unknown) {
  return error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { name: 'Error', message: String(error) }
}
