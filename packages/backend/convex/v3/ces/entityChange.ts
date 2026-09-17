import { v } from 'convex/values'
import { z } from 'zod'

export const jobFields = v.object({
  from_scan_at: v.string(),
  scan_at: v.string(),
  collection: v.union(v.literal('models'), v.literal('providers'), v.literal('endpoints')),
  entity_id: v.string(),
  category: v.union(v.literal('lifecycle'), v.literal('pricing'), v.literal('update')),
  content: v.string(),
})

const record = z.record(z.string(), z.json())
const pair = z.object({ before: record.nullable(), after: record.nullable() })

/** Assigned changes are separate from evidence: a pricing job must not also handle status changes.
 * JSON strings preserve upstream keys that Convex object fields cannot represent.
 */
export const JobContent = z.object({
  changes: pair,
  context: z.object({
    before: z.object({
      entity: record.nullable(),
      model: record.nullable().optional(),
      provider: record.nullable().optional(),
    }),
    after: z.object({
      entity: record.nullable(),
      model: record.nullable().optional(),
      provider: record.nullable().optional(),
    }),
  }),
})

export function readJobContent(content: string): z.infer<typeof JobContent> {
  return JobContent.parse(JSON.parse(content))
}

/** The initial concrete event format; the event table also permits unrelated future formats. */
export const EntityChange = JobContent.extend({
  type: z.literal('entity-change'),
  from_scan_at: z.iso.datetime(),
  scan_at: z.iso.datetime(),
  collection: z.enum(['models', 'providers', 'endpoints']),
  entity_id: z.string(),
  category: z.enum(['lifecycle', 'pricing', 'update']),
})
export type EntityChange = z.infer<typeof EntityChange>
