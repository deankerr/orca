import type { AlertChange, EntityAlert } from './curate'

/** Provider activity covers identity, location and public links. */
const providerFields = new Set([
  'datacenters',
  'display_name',
  'headquarters',
  'id',
  'name',
  'privacy_policy_url',
  'status_page_url',
  'terms_of_service_url',
])

const isPricing = (change: AlertChange) => change.field.startsWith('pricing.')

/** Default field selection shared by all alert products. */
export function select(event: EntityAlert): EntityAlert | null {
  if (event.type === 'provider_updated') {
    const changes = event.changes.filter((change) => providerFields.has(change.field))

    return changes.length === 0 ? null : { ...event, changes }
  }

  if (event.type === 'endpoint_updated') {
    // Reasoning belongs to model alerts. A schedule makes current-band price movement unannounced.
    const changes = event.changes.filter(
      (change) =>
        change.field !== 'supports_reasoning' &&
        (event.pricing_is_scheduled !== true ||
          !isPricing(change) ||
          change.field === 'pricing.overrides'),
    )

    return changes.length === 0 ? null : { ...event, changes }
  }

  return event
}
