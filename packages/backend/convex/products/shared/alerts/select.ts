import type { EntityAlert } from './curate'
import { announcedPricing } from './pricing'

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

/** Default field selection shared by all alert products. */
export function select(event: EntityAlert): EntityAlert | null {
  if (event.type === 'provider_updated') {
    const changes = event.changes.filter((change) => providerFields.has(change.field))

    return changes.length === 0 ? null : { ...event, changes }
  }

  if (event.type === 'endpoint_updated') {
    const announced = announcedPricing(event.changes, event.pricing_is_scheduled)

    if (announced === null) {
      return null
    }

    // Reasoning belongs to model alerts.
    const changes = announced.filter((change) => change.field !== 'supports_reasoning')

    return changes.length === 0 ? null : { ...event, changes }
  }

  return event
}
