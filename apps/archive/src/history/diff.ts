import type { CoreEndpoint, CoreModel } from '@orca/schema/archive-core.ts'

export type EntityType = 'model' | 'endpoint'
export type EventType = 'available' | 'updated' | 'unavailable'

export interface FieldChange {
  readonly path: string
  readonly beforePresent: boolean
  readonly before: unknown
  readonly afterPresent: boolean
  readonly after: unknown
}

export interface EntityEvent {
  readonly eventId: string
  readonly crawlId: string
  readonly previousCrawlId: string | undefined
  readonly entityType: EntityType
  readonly entityId: string
  readonly eventType: EventType
  readonly modelSlug: string
  readonly providerName: string | undefined
  readonly providerSlug: string | undefined
  /** State valid immediately after the event, or last-known state for an unavailable event. */
  readonly context: CoreModel | CoreEndpoint
  readonly fields: readonly FieldChange[]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** JSON with recursively sorted object keys gives comparisons and ids a stable byte representation. */
export const canonicalJson = (value: unknown): string => {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) {
      return item.map(normalize)
    }
    if (isObject(item)) {
      return Object.fromEntries(
        Object.entries(item)
          .filter(([, child]) => child !== undefined)
          .toSorted(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      )
    }
    return item
  }
  return JSON.stringify(normalize(value))
}

const compareFields = (before: unknown, after: unknown, prefix = ''): FieldChange[] => {
  if (canonicalJson(before) === canonicalJson(after)) {
    return []
  }

  if (isObject(before) && isObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)])
    return [...keys]
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

const eventId = (parts: readonly string[]) => {
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(parts.join('\0'))
  return hasher.digest('hex')
}

interface EventIdentity {
  readonly entityId: string
  readonly entityType: EntityType
  readonly modelSlug: string
  readonly providerName?: string
  readonly providerSlug?: string
}

export const createEvent = (args: {
  readonly crawlId: string
  readonly previousCrawlId?: string
  readonly identity: EventIdentity
  readonly before?: CoreModel | CoreEndpoint
  readonly after?: CoreModel | CoreEndpoint
}): EntityEvent | undefined => {
  let eventType: EventType = 'updated'
  if (args.before === undefined) {
    eventType = 'available'
  } else if (args.after === undefined) {
    eventType = 'unavailable'
  }
  const fields =
    args.before !== undefined && args.after !== undefined
      ? compareFields(args.before, args.after)
      : []
  if (eventType === 'updated' && fields.length === 0) {
    return undefined
  }
  const context = args.after ?? args.before
  if (context === undefined) {
    return undefined
  }
  const { identity } = args
  return {
    context,
    crawlId: args.crawlId,
    entityId: identity.entityId,
    entityType: identity.entityType,
    eventId: eventId(['core-v1', args.crawlId, identity.entityType, identity.entityId]),
    eventType,
    fields,
    modelSlug: identity.modelSlug,
    previousCrawlId: args.previousCrawlId,
    providerName: identity.providerName,
    providerSlug: identity.providerSlug,
  }
}
