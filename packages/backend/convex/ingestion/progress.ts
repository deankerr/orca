import { ConvexError } from 'convex/values'

import { internal } from '#generated/api'
import { env } from '#generated/server'
import type { MutationCtx } from '#generated/server'

import { REGISTRATIONS_TABLE, ingestionProcesses } from './table'
import type { IngestionProcess, RegistrationId } from './table'

/** Output, progress and the final continuation commit in the same transaction. */
export async function commitProcess(
  ctx: MutationCtx,
  registrationId: RegistrationId,
  key: IngestionProcess,
  write: () => Promise<void>,
): Promise<void> {
  const registration = await ctx.db.get(REGISTRATIONS_TABLE, registrationId)

  if (registration === null) {
    throw new ConvexError({ message: 'Registration not found', registration_id: registrationId })
  }

  if (registration.progress.kind === 'complete' || registration.progress.completed.includes(key)) {
    return
  }

  await write()

  const completed = [...registration.progress.completed, key]
  const isComplete = ingestionProcesses.every((process) => completed.includes(process))

  await ctx.db.patch(REGISTRATIONS_TABLE, registrationId, {
    progress: isComplete ? { kind: 'complete' } : { kind: 'pending', completed },
  })

  if (isComplete) {
    if (registration.from_scan_at !== null && env.ORCA_DISCORD_AUTO_SEND_ENABLED === 'true') {
      await ctx.scheduler.runAfter(0, internal.products.discord.delivery.sendRegistrationAlerts, {
        registration_id: registrationId,
      })
    }
    await ctx.scheduler.runAfter(0, internal.ingestion.register.next, {})
  }
}
