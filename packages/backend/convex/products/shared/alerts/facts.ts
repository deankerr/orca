import type { KindValues, ValueChange } from '../../v5/projection'
import type { AlertChange, AlertFact, AlertKind } from './curate'

/** A lifecycle fact by Contract field, when it holds the kind the caller presents. */
export function fact<K extends AlertKind>(
  facts: readonly AlertFact[],
  field: string,
  kind: K,
): Extract<AlertFact, { kind: K }> | undefined {
  return facts.find(
    (item): item is Extract<AlertFact, { kind: K }> => item.field === field && item.kind === kind,
  )
}

type SideKind = Exclude<AlertKind, 'list'>

/** Each side of a value change as a fact, so presentation follows one path for facts and changes. */
export function sides<K extends SideKind>(change: ValueChange<K>) {
  const side = (value: KindValues[K]): AlertFact<K> => ({
    field: change.field,
    kind: change.kind,
    value,
  })

  return { after: side(change.after), before: side(change.before) }
}

/** Both sides of a quantity change; discounts are fractions whose movement is not a delta. */
export function measured(
  change: AlertChange,
): { before: number | string; after: number | string } | null {
  if (change.kind !== 'count' && change.kind !== 'price') {
    return null
  }

  const { before, after } = change

  return before === null || after === null ? null : { after, before }
}
