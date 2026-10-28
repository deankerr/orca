import type { EntityAlert } from '../shared/alerts/curate'

/** One source's interpreted alert; null when it is ineligible. */
export type InterpretedRow = { source_id: string; event: EntityAlert | null }

/**
 * TEMPORARY: Discord was too noisy to be useful, so it announces only discoveries and non-pricing
 * updates while its policy is reassessed. Muted alerts keep their complete preparation and rendering
 * code; removing this filter from `renderRows` restores them.
 */
export function muteNoise(rows: InterpretedRow[]) {
  const models = new Set(
    rows.flatMap(({ event }) =>
      event?.type === 'model_added' || event?.type === 'model_removed' ? [modelKey(event)] : [],
    ),
  )

  const muted: string[] = []

  const kept = rows.flatMap((row): InterpretedRow[] => {
    const event = row.event === null ? null : quiet(row.event, models)

    if (row.event !== null && event === null) {
      muted.push(row.source_id)

      return []
    }

    return [{ ...row, event }]
  })

  return { muted, rows: kept }
}

const BATCH_SUFFIX = ':batch'

function modelKey(event: EntityAlert, model_id = event.entity_id): string {
  return JSON.stringify([event.observed_at, event.type, model_id])
}

/** The alert with muted content removed, or null when nothing remains. */
function quiet(event: EntityAlert, models: Set<string>): EntityAlert | null {
  if (event.type === 'endpoint_removed') {
    return null
  }

  if (event.type === 'endpoint_added') {
    // Relistings flap with upstream availability.
    return event.previously_known === true ? null : event
  }

  if (event.type === 'endpoint_updated') {
    const changes = event.changes.filter((change) => !change.field.startsWith('pricing.'))

    return changes.length === 0 ? null : { ...event, changes }
  }

  if (event.type === 'model_added' || event.type === 'model_removed') {
    // A batch variant's card repeats its standard model's card; its endpoints still announce.
    const { entity_id } = event

    return entity_id.endsWith(BATCH_SUFFIX) &&
      models.has(modelKey(event, entity_id.slice(0, -BATCH_SUFFIX.length)))
      ? null
      : event
  }

  return event
}
