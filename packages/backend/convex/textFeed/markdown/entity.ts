import type { EntityChange, EntityChangeContent } from '../../changeEvents/schema'
import { describeChanges, inlineCode, label, object, value } from './fields'
import type { RecordValue } from './fields'

export type RenderableEvent = Omit<EntityChange, 'content' | 'input_ids'> & {
  _id: string
  content: EntityChangeContent
}

/** Operation is local to each event, so contradictory operations need no reconciliation. */
function operation(event: RenderableEvent) {
  const { before, after } = event.content.changes
  return before === null ? 'added' : after === null ? 'removed' : 'updated'
}

/** Providers stand alone; model events and their endpoints share a model section. */
export function groupKey(event: RenderableEvent): string {
  return JSON.stringify(
    event.entity_kind === 'provider'
      ? ['provider', event.entity_id]
      : ['model', modelIdentity(event).id],
  )
}

/** Model changes precede endpoints regardless of event arrival order. */
export function renderGroup(events: RenderableEvent[]): string {
  const ordered = events.toSorted(
    (a, b) => Number(b.entity_kind === 'model') - Number(a.entity_kind === 'model'),
  )
  const [first] = ordered
  // Keep conflicting operations separate instead of choosing one operation for an entity.
  const entities = Map.groupBy(ordered, (event) =>
    JSON.stringify([event.entity_kind, event.entity_id, operation(event)]),
  )
  const model = modelIdentity(first)
  return [
    ...(first.entity_kind === 'provider' ? [] : [`### ${identity(model.name, model.id)}`]),
    ...[...entities.values()].map(renderEntity),
  ].join('\n\n')
}

function entityRecord(event: RenderableEvent): RecordValue {
  const { context, changes } = event.content
  return context.after.entity ?? context.before.entity ?? changes.after ?? changes.before ?? {}
}

function modelIdentity(event: RenderableEvent) {
  const record = entityRecord(event)
  const id = name(
    record,
    'model_id',
    event.entity_kind === 'model' ? event.entity_id : 'unknown model',
  )
  return {
    id,
    name: name(record, event.entity_kind === 'model' ? 'display_name' : 'model_display_name', id),
  }
}

/** Render one entity and operation, retaining each contributing event's details and source link. */
function renderEntity(events: RenderableEvent[]): string {
  const [event] = events
  const record = entityRecord(event)
  const kind = { model: 'Model', provider: 'Provider', endpoint: 'Endpoint' }[event.entity_kind]
  const heading =
    event.entity_kind === 'endpoint'
      ? `#### ${identity(name(record, 'provider_display_name', 'Unknown provider'), name(record, 'provider_tag', 'unknown provider tag'))}`
      : event.entity_kind === 'provider'
        ? `### ${identity(name(record, 'display_name', event.entity_id), name(record, 'provider_id', event.entity_id))}`
        : null
  const details =
    operation(event) === 'updated'
      ? events.flatMap(({ content }) =>
          describeChanges(content.changes.before ?? {}, content.changes.after ?? {}),
        )
      : displayEntity(event.entity_kind, record)
  const links = events.map(
    (source) =>
      `[${events.length === 1 ? 'Full event' : `${source.category} event`}](/ces/events/${encodeURIComponent(source._id)})`,
  )
  return [
    ...(heading === null ? [] : [heading]),
    `${kind} ${operation(event)}.`,
    ...details.slice(0, 30),
    ...(details.length > 30
      ? [`${details.length - 30} additional field changes are retained in the events.`]
      : []),
    links.join(' · '),
  ].join('\n\n')
}

/** Lifecycle summaries describe the entity rather than treating its whole record as changed fields. */
function displayEntity(kind: EntityChange['entity_kind'], record: RecordValue): string[] {
  const details: string[] = []
  if (kind === 'endpoint' && object(record.pricing)) {
    for (const key of ['prompt', 'completion']) {
      if (record.pricing[key] !== undefined) {
        details.push(
          `- ${label(`pricing.${key}`)}: ${value(record.pricing[key], `pricing.${key}`)}.`,
        )
      }
    }
  }
  const description = object(record.metadata) ? record.metadata.description : undefined
  if (typeof description === 'string') {
    details.push(`- Description: ${value(description, 'description')}.`)
  }
  return details
}

function name(record: RecordValue, key: string, fallback: string): string {
  return typeof record[key] === 'string' ? record[key] : fallback
}

function identity(displayName: string, id: string): string {
  return `${escape(displayName)} (${inlineCode(id)})`
}

/** Keep upstream names on one heading line and treat Markdown punctuation literally. */
function escape(text: string): string {
  return text.replaceAll(/\s+/g, ' ').replaceAll(/[\\`*_{}[\]<>()#|]/g, '\\$&')
}
