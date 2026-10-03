import type { BatchAlert } from '../../shared/batch'
import type { EntityAlert } from '../../shared/curate'
import { colors, truncateContent } from './card'
import type { Card } from './card'
import { code, dot } from './display'
import { endpointFieldChange } from './endpointCard'
import { fieldChange } from './fields'
import { pricingChanges } from './pricing'

export type Notification = { message: Card; event_ids: string[] }

function identity(event: EntityAlert): string {
  if (event.entity_kind === 'model') {
    return code(truncateContent(event.context.model.model_id, 500, 'batch.model_id'))
  }

  if (event.entity_kind === 'provider') {
    return code(truncateContent(event.context.provider.provider_id, 500, 'batch.provider_id'))
  }

  return `${code(truncateContent(event.context.model.model_id, 500, 'batch.model_id'))}\n  ${code(truncateContent(event.context.endpoint.provider_tag, 500, 'batch.provider_tag'))}${dot}${code(event.entity_id.slice(0, 6))}`
}

/** One shared field per card; page identities without dropping affected entities or source IDs. */
export function batchCards(batch: BatchAlert): Notification[] {
  const [first] = batch.members

  if (first === undefined) {
    return []
  }

  const { change } = batch
  const detail = change.path.startsWith('pricing.')
    ? pricingChanges([change]).join('\n')
    : first.event.entity_kind === 'endpoint'
      ? endpointFieldChange(change)
      : fieldChange(change, { label: change.path })
  // Bound each identity field while retaining every member, source ID and endpoint UUID prefix.
  const members = batch.members
    .map((member) => ({
      event_id: member.event_id,
      line: `${identity(member.event)}\n`,
    }))
    .toSorted((a, b) => a.line.localeCompare(b.line))
  let longestIdentity = 0

  for (const member of members) {
    longestIdentity = Math.max(longestIdentity, member.line.length)
  }

  const label = `\n\nAffected ${first.event.entity_kind}s:\n`
  const heading = `${truncateContent(detail, 4000 - label.length - longestIdentity, `batch.${change.path}`)}${label}`
  const pages: { description: string; event_ids: string[] }[] = []
  let page = { description: heading, event_ids: [] as string[] }

  for (const { line, event_id } of members) {
    // Bound each card's description and affected-entity count.
    if (page.description.length + line.length > 4000 || page.event_ids.length === 40) {
      pages.push(page)
      page = { description: heading, event_ids: [] }
    }

    page.description += line
    page.event_ids.push(event_id)
  }

  pages.push(page)

  return pages.map(({ description, event_ids }, index) => ({
    event_ids,
    message: {
      allowed_mentions: { parse: [] },
      embeds: [
        {
          title: `${batch.members.length} ${first.event.entity_kind}s updated${pages.length > 1 ? ` (${index + 1}/${pages.length})` : ''}`,
          description,
          timestamp: first.event.observed_at,
          color: colors.updated,
        },
      ],
    },
  }))
}
