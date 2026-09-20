import { EntityChangeContent } from '../changeEvents/schema'
import type { EntityChange } from '../changeEvents/schema'
import { groupKey, renderGroup } from './markdown/entity'

/** Render a bounded event window as a newest-first document; time groups may be incomplete. */
export function renderFeed(events: (Omit<EntityChange, 'input_ids'> & { _id: string })[]): string {
  const decoded = events.map((event) => ({
    ...event,
    content: EntityChangeContent.parse(JSON.parse(event.content)),
  }))
  const times = Map.groupBy(decoded, (event) => event.scan_at)
  const sections = [...times]
    .toSorted(([a], [b]) => b.localeCompare(a))
    .map(([time, group]) => {
      const entities = Map.groupBy(group, groupKey)
      return [
        `## As of ${time.slice(0, 19).replace('T', ' ')} UTC`,
        ...[...entities.values()].map(renderGroup),
      ].join('\n\n')
    })
  return `${[
    '# ORCA change feed',
    events.length === 0 ? 'No events yet.' : 'Latest updates, newest first.',
    ...sections,
  ].join('\n\n')}\n`
}
