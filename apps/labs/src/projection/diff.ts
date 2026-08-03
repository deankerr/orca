import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'

import { canonicalJson, isRecord } from '../transform/json.ts'
import type {
  EndpointEventContext,
  EntityEvent,
  EntityType,
  EventType,
  FieldChange,
} from './types.ts'

const compareFields = (before: unknown, after: unknown, prefix = ''): FieldChange[] => {
  if (canonicalJson(before) === canonicalJson(after)) {
    return []
  }
  if (isRecord(before) && isRecord(after)) {
    return [...new Set([...Object.keys(before), ...Object.keys(after)])]
      .toSorted((left, right) => left.localeCompare(right))
      .flatMap((key) => {
        const path = prefix === '' ? key : `${prefix}.${key}`
        const beforePresent = Object.hasOwn(before, key) && before[key] !== undefined
        const afterPresent = Object.hasOwn(after, key) && after[key] !== undefined
        if (!beforePresent || !afterPresent) {
          return [{ after: after[key], afterPresent, before: before[key], beforePresent, path }]
        }
        return compareFields(before[key], after[key], path)
      })
  }
  return [{ after, afterPresent: true, before, beforePresent: true, path: prefix }]
}

const eventId = (crawlId: string, entityType: EntityType, entityId: string) => {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(['core-v1', crawlId, entityType, entityId].join('\0'))
  return hasher.digest('hex')
}

type EventInput =
  | {
      readonly after?: CoreModel
      readonly before?: CoreModel
      readonly context: CoreModel
      readonly entityType: 'model'
    }
  | {
      readonly after?: CoreEndpoint
      readonly before?: CoreEndpoint
      readonly context: EndpointEventContext
      readonly entityType: 'endpoint'
    }

export const diffEntity = (
  input: EventInput & {
    readonly crawlId: string
    readonly entityId: string
    readonly modelSlug: string
    readonly previousCrawlId?: string
    readonly providerName?: string
    readonly providerSlug?: string
  },
): EntityEvent | undefined => {
  let eventType: EventType = 'updated'
  if (input.before === undefined) {
    eventType = 'available'
  } else if (input.after === undefined) {
    eventType = 'unavailable'
  }
  const fields =
    input.before !== undefined && input.after !== undefined
      ? compareFields(input.before, input.after)
      : []
  if (eventType === 'updated' && fields.length === 0) {
    return undefined
  }
  const common = {
    crawlId: input.crawlId,
    entityId: input.entityId,
    eventId: eventId(input.crawlId, input.entityType, input.entityId),
    eventType,
    fields,
    modelSlug: input.modelSlug,
    previousCrawlId: input.previousCrawlId,
    providerName: input.providerName,
    providerSlug: input.providerSlug,
  }
  if (input.entityType === 'model') {
    return { ...common, context: input.context, entityType: input.entityType }
  }
  return { ...common, context: input.context, entityType: input.entityType }
}
