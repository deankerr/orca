import type { EntityAlert, FieldChange } from './curate'
import { fact } from './facts'

/** Default field selection shared by all alert products. */
export function select(event: EntityAlert): EntityAlert | null {
  if (event.type === 'provider_updated') {
    const changes = providerChanges(event.changes)
    return changes.length === 0 ? null : { ...event, changes }
  }

  if (event.type === 'endpoint_updated') {
    const changes = event.changes.filter(
      (change) =>
        change.path !== 'supports_reasoning' &&
        (event.pricing_is_scheduled !== true ||
          !change.path.startsWith('pricing.') ||
          change.path === 'pricing.overrides'),
    )
    return changes.length === 0 ? null : { ...event, changes }
  }

  return event
}

/** Provider activity covers identity, location and public links. */
function providerChanges(changes: FieldChange[]): FieldChange[] {
  const fields = new Set([
    'provider_id',
    'displayName',
    'headquarters',
    'datacenters',
    'statusPageUrl',
    'dataPolicy.termsOfServiceURL',
    'dataPolicy.privacyPolicyURL',
  ])

  return changes.flatMap<FieldChange>((change) => {
    if (fields.has(change.path)) {
      return [change]
    }

    if (
      change.path !== 'dataPolicy' ||
      change.type === 'set_updated' ||
      change.type === 'field_changed'
    ) {
      return []
    }

    // A whole policy object can arrive or disappear; project only its URL children.
    return ['dataPolicy.termsOfServiceURL', 'dataPolicy.privacyPolicyURL'].flatMap<FieldChange>(
      (path) => {
        const before = 'before' in change ? fact({ dataPolicy: change.before }, path) : undefined
        const after = 'after' in change ? fact({ dataPolicy: change.after }, path) : undefined

        if (before === after) {
          return []
        }

        if (after === undefined) {
          return before === undefined ? [] : [{ type: 'field_removed', path, before }]
        }

        return before === undefined
          ? [{ type: 'field_added', path, after }]
          : [{ type: 'field_updated', path, before, after }]
      },
    )
  })
}
