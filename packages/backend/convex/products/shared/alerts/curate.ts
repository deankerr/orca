import { withoutSystemFields } from 'convex-helpers'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import * as R from 'remeda'

import { decodePricing } from '../../../catalog/pricing'
import { eventsTable } from '../../../catalog/tables/events'
import type { EventRow } from '../../../catalog/tables/events'
import { textOrNull } from '../../../fields'
import { endpointFields, translateEndpointUpdate } from '../../v5/endpoints'
import { modelFields } from '../../v5/models'
import { facts, field, translateStored } from '../../v5/projection'
import type { FieldChange, FieldFact, Fields, Kind, Translation } from '../../v5/projection'
import { providerFields } from '../../v5/providers'
import { decodeSnapshot } from './decode'
import { isScheduledPricing } from './pricing'

/** Alerts announce Contract fields, plus model warnings that the Contract does not yet publish. */
const alertFields = {
  endpoint: endpointFields,
  model: {
    ...modelFields,
    warning_message: field('prose', ['metadata', 'warning_message'], textOrNull),
  },
  provider: providerFields,
} satisfies Record<EventRow['entity_kind'], Fields>

/** Opaque values are announced as changed, never projected into alerts. */
export type AlertKind = Exclude<Kind, 'opaque'>

const values = {
  count: v.union(v.number(), v.null()),
  flag: v.union(v.boolean(), v.null()),
  list: v.union(v.array(v.string()), v.null()),
  percent: v.number(),
  price: v.union(v.string(), v.null()),
  prose: v.union(v.string(), v.null()),
  text: v.union(v.string(), v.null()),
}

const fact = <K extends AlertKind>(kind: K) =>
  v.object({ field: v.string(), kind: v.literal(kind), value: values[kind] })

const alertFact = v.union(
  fact('count'),
  fact('flag'),
  fact('list'),
  fact('percent'),
  fact('price'),
  fact('prose'),
  fact('text'),
)

const valueChange = <K extends Exclude<AlertKind, 'list'>>(kind: K) =>
  v.object({ after: values[kind], before: values[kind], field: v.string(), kind: v.literal(kind) })

const alertChange = v.union(
  valueChange('count'),
  valueChange('flag'),
  valueChange('percent'),
  valueChange('price'),
  valueChange('prose'),
  valueChange('text'),
  v.object({
    added: v.array(v.string()),
    field: v.string(),
    kind: v.literal('list'),
    removed: v.array(v.string()),
  }),
  v.object({ field: v.string(), kind: v.literal('opaque') }),
)

export const entityAlert = v.union(
  ...eventsTable.validator.members.flatMap((member) => {
    const kind = member.fields.entity_kind.value

    const identity = member.omit('change_json', 'type', 'scan_at').extend({
      observed_at: v.string(),
      previously_known: v.optional(v.boolean()),
      /** Derived from complete pricing quotes, never persisted on the event. */
      pricing_is_scheduled: v.optional(v.boolean()),
    })

    return [
      identity.extend({ changes: v.array(alertChange), type: v.literal(`${kind}_updated`) }),
      identity.extend({ after: v.array(alertFact), type: v.literal(`${kind}_added`) }),
      identity.extend({ before: v.array(alertFact), type: v.literal(`${kind}_removed`) }),
    ]
  }),
)

export type EntityAlert = Infer<typeof entityAlert>

export type AlertChange = Infer<typeof alertChange>

export type AlertFact<K extends AlertKind = AlertKind> = FieldFact<K>

function lifecycleFacts(row: EventRow): { facts: AlertFact[]; pricing_is_scheduled?: boolean } {
  const snapshot = decodeSnapshot(row)

  const selected = facts(alertFields[snapshot.entity_kind], snapshot.value).filter(
    (item): item is AlertFact => item.kind !== 'opaque',
  )

  return snapshot.entity_kind === 'endpoint'
    ? { facts: selected, pricing_is_scheduled: isScheduledPricing(snapshot.value.pricing) }
    : { facts: selected }
}

function translation(row: EventRow): Translation & { pricing_is_scheduled?: boolean } {
  if (row.entity_kind !== 'endpoint') {
    return translateStored(alertFields[row.entity_kind], row.change_json)
  }

  const { pricing } = row.context
  const result = translateEndpointUpdate(row)

  return pricing === undefined
    ? result
    : {
        ...result,
        pricing_is_scheduled: [pricing.before, pricing.after].some((quote) =>
          isScheduledPricing(decodePricing(quote)),
        ),
      }
}

/**
 * Opaque fields are announced as changed, without values, and only under a price schedule.
 * Override row order has been stable upstream. A reorder intentionally counts as a coarse schedule
 * change; we do not interpret condition equivalence. Overrides without a schedule are not announced.
 */
function announced(
  changes: FieldChange[],
  opaque: string[],
  scheduled: boolean | undefined,
): AlertChange[] {
  const changed = (name: string): AlertChange[] =>
    scheduled === true ? [{ field: name, kind: 'opaque' }] : []

  return [
    ...changes.flatMap((change) => (change.kind === 'opaque' ? changed(change.field) : [change])),
    ...opaque.flatMap(changed),
  ]
}

/** Interpret captured facts only; curation never reads current Catalog or modifies stored events. */
export function curate(row: EventRow): EntityAlert | null {
  const { change_json: _json, type: _type, scan_at, ...subject } = withoutSystemFields(row)
  const identity = { ...subject, observed_at: scan_at }

  if (row.type !== 'UPDATE') {
    const { facts: selected, ...scheduled } = lifecycleFacts(row)

    return row.type === 'ADD'
      ? { ...identity, ...scheduled, after: selected, type: `${row.entity_kind}_added` }
      : { ...identity, ...scheduled, before: selected, type: `${row.entity_kind}_removed` }
  }

  const fields: Fields = alertFields[row.entity_kind]
  const { changes, unresolved, pricing_is_scheduled } = translation(row)

  // An opaque change needs no values; any other field must have both sides to be announced.
  const [opaque, unknown] = R.partition(unresolved, (name) => fields[name]?.kind === 'opaque')

  if (unknown.length > 0) {
    throw new ConvexError({ message: 'Unresolved alert fields', unresolved: unknown })
  }

  const announcedChanges = announced(changes, opaque, pricing_is_scheduled)

  return announcedChanges.length === 0
    ? null
    : {
        ...identity,
        changes: announcedChanges,
        type: `${row.entity_kind}_updated`,
        ...R.pickBy({ pricing_is_scheduled }, R.isDefined),
      }
}
