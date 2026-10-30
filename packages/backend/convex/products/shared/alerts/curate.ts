import { withoutSystemFields } from 'convex-helpers'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import * as R from 'remeda'

import { decodePricing } from '../../../catalog/pricing'
import { eventsTable } from '../../../catalog/tables/events'
import type { EventRow } from '../../../catalog/tables/events'
import { endpointFields, translateEndpointUpdate } from '../../v5/endpoints'
import { modelFields } from '../../v5/models'
import { facts, translateStored } from '../../v5/projection'
import type { FieldFact, Fields, Kind, Translation } from '../../v5/projection'
import { providerFields } from '../../v5/providers'
import { decodeSnapshot } from './decode'
import { isScheduledPricing } from './pricing'

const alertFields = {
  endpoint: endpointFields,
  model: modelFields,
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

const factValidator = <K extends AlertKind>(kind: K) =>
  v.object({ field: v.string(), kind: v.literal(kind), value: values[kind] })

const alertFact = v.union(
  factValidator('count'),
  factValidator('flag'),
  factValidator('list'),
  factValidator('percent'),
  factValidator('price'),
  factValidator('prose'),
  factValidator('text'),
)

const valueChangeValidator = <K extends Exclude<AlertKind, 'list'>>(kind: K) =>
  v.object({ after: values[kind], before: values[kind], field: v.string(), kind: v.literal(kind) })

const alertChange = v.union(
  valueChangeValidator('count'),
  valueChangeValidator('flag'),
  valueChangeValidator('percent'),
  valueChangeValidator('price'),
  valueChangeValidator('prose'),
  valueChangeValidator('text'),
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

  const { changes, unresolved, pricing_is_scheduled } = translation(row)

  // A field must have both sides to be announced.
  if (unresolved.length > 0) {
    throw new ConvexError({ message: 'Unresolved alert fields', unresolved })
  }

  return changes.length === 0
    ? null
    : {
        ...identity,
        changes,
        type: `${row.entity_kind}_updated`,
        ...R.pickBy({ pricing_is_scheduled }, R.isDefined),
      }
}
