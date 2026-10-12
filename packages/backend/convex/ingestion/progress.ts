import { ConvexError } from 'convex/values'

import { internal } from '#generated/api'
import { env } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { INGESTIONS_TABLE, ingestKeys } from './table'
import type { IngestKey, InputId } from './table'

/** Output, progress and the final continuation commit in the same transaction. */
export async function commitStage(
  ctx: MutationCtx,
  inputId: InputId,
  key: IngestKey,
  write: () => Promise<void>,
): Promise<void> {
  const input = await ctx.db.get(INGESTIONS_TABLE, inputId)

  if (input === null) {
    throw new ConvexError({ message: 'Source input is not registered', ingestion_id: inputId })
  }

  if (input.progress.kind === 'complete' || input.progress.completed.includes(key)) {
    return
  }

  await write()

  const completed = [...input.progress.completed, key]
  const isComplete = ingestKeys.every((stage) => completed.includes(stage))

  await ctx.db.patch(INGESTIONS_TABLE, inputId, {
    progress: isComplete ? { kind: 'complete' } : { kind: 'pending', completed },
  })

  if (isComplete) {
    if (input.from_scan_at !== null && env.ORCA_DISCORD_AUTO_SEND_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.products.discord.delivery.sendIngestionAlerts, {
        ingestion_id: inputId,
      })
    }
    await ctx.scheduler.runAfter(0, internal.ingestion.run.enqueueNextInput, {})
  }
}
