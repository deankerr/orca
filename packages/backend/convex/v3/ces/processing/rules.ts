import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { EntityChange, readJobContent } from '../entityChange'

/** Initial rules: each job becomes one event. Rules own their state and may later group jobs or leave
 * them unfinished; event creation and completion run in the caller's single mutation transaction.
 */
export async function process(ctx: MutationCtx, jobs: Doc<'ces_jobs'>[]) {
  for (const job of jobs) {
    const content = EntityChange.parse({
      type: 'entity-change',
      from_scan_at: job.from_scan_at,
      scan_at: job.scan_at,
      collection: job.collection,
      entity_id: job.entity_id,
      category: job.category,
      ...readJobContent(job.content),
    })
    await ctx.db.insert('ces_events', { jobs: [job._id], content: JSON.stringify(content) })
    await ctx.db.patch('ces_jobs', job._id, { complete: true })
  }
}
