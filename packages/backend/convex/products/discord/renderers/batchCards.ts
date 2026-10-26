import type { BatchAlert } from '../../shared/alerts/batch'
import type { AlertChange, EntityAlert } from '../../shared/alerts/curate'
import { colors, embedCard, gridUrl, logoUrl, truncateContent } from './card'
import type { Card, DiscordUrls } from './card'
import { code, dot, escape } from './display'
import { endpointFieldChange } from './endpointCard'
import { fieldChange } from './fields'
import { pricingChanges } from './pricing'

export type Notification = { message: Card; source_ids: string[] }

function identity(event: EntityAlert, groupByModel: boolean) {
  if (event.entity_kind === 'model') {
    return {
      group: '',
      line: code(truncateContent(event.context.model.model_id, 500, 'batch.model_id')),
    }
  }

  if (event.entity_kind === 'provider') {
    return {
      group: '',
      line: `${escape(truncateContent(event.context.provider.display_name, 500, 'batch.provider_name'))}${dot}${code(truncateContent(event.context.provider.provider_id, 500, 'batch.provider_id'))}`,
    }
  }

  const { model, provider, endpoint } = event.context
  const label = groupByModel ? endpoint.provider_tag : model.model_id

  return {
    group: groupByModel ? model.model_id : provider.provider_id,
    line: `${code(truncateContent(label, 500, groupByModel ? 'batch.provider_tag' : 'batch.model_id'))}${dot}${code(event.entity_id.slice(0, 6))}`,
  }
}

function sharedChange(change: AlertChange, event: EntityAlert): string {
  if (change.field.startsWith('pricing.')) {
    return pricingChanges([change]).join('\n')
  }

  return event.entity_kind === 'endpoint'
    ? endpointFieldChange(change)
    : fieldChange(change, { label: change.field })
}

/** Page shared changes without dropping affected entities or source IDs. */
export function batchCards(batch: BatchAlert, urls: DiscordUrls): Notification[] {
  const [first] = batch.members

  if (first === undefined) {
    return []
  }

  const { change } = batch
  const removed = change.kind === 'endpoint_removed'
  const detail = 'field' in change ? sharedChange(change, first.event) : ''

  const endpoints = batch.members
    .map(({ event }) => event)
    .filter((event) => event.entity_kind === 'endpoint')

  const providerIds = new Set(endpoints.map((event) => event.context.provider.provider_id))
  const provider = removed && providerIds.size === 1 ? endpoints[0]?.context.provider : undefined

  // Prefer the dimension with fewer headings; ties group by provider.
  const groupByModel =
    new Set(endpoints.map((event) => event.context.model.model_id)).size < providerIds.size

  // Bound each identity field while retaining every member, source ID and endpoint UUID prefix.
  const members = batch.members
    .map((member) => {
      const { group, line } = identity(member.event, groupByModel)

      const groupLabel =
        !groupByModel && member.event.entity_kind === 'endpoint'
          ? `**${escape(truncateContent(member.event.context.provider.display_name, 500, 'batch.provider_name'))}**${dot}${code(truncateContent(group, 500, 'batch.group'))}`
          : `**${code(truncateContent(group, 500, 'batch.group'))}**`

      return {
        group,
        heading: group === '' || provider !== undefined ? '' : `\n${groupLabel}\n`,
        line: `${line}\n`,
        source_id: member.source_id,
      }
    })
    .toSorted((a, b) => a.group.localeCompare(b.group) || a.line.localeCompare(b.line))

  let longestIdentity = 0

  for (const member of members) {
    longestIdentity = Math.max(longestIdentity, member.heading.length + member.line.length)
  }

  let label = removed ? '' : `\n\nAffected ${first.event.entity_kind}s:\n`

  if (provider !== undefined) {
    label = `− Provider **${escape(truncateContent(provider.display_name, 500, 'batch.provider_name'))}** unlisted ${batch.members.length} endpoints.\n\n`
  }

  const heading = `${truncateContent(detail, 4000 - label.length - longestIdentity, `batch.${'field' in change ? change.field : change.kind}`)}${label}`
  const pages: { description: string; source_ids: string[] }[] = []
  let page: (typeof pages)[number] = { description: heading, source_ids: [] }
  let previousGroup: string | undefined

  for (const { group, heading: groupHeading, line, source_id } of members) {
    const section = group === previousGroup ? '' : groupHeading

    // Bound each card's description and affected-entity count.
    if (
      page.description.length + section.length + line.length > 4000 ||
      page.source_ids.length === 40
    ) {
      pages.push(page)
      page = { description: heading, source_ids: [] }
      previousGroup = undefined
    }

    page.description += `${group === previousGroup ? '' : groupHeading}${line}`
    page.source_ids.push(source_id)
    previousGroup = group
  }

  pages.push(page)

  return pages.map(({ description, source_ids }, index) => ({
    message: {
      allowed_mentions: { parse: [] },
      ...(provider === undefined
        ? {
            embeds: [
              {
                color: removed ? colors.removed : colors.updated,
                description,
                timestamp: first.event.observed_at,
                title: `${batch.members.length} ${first.event.entity_kind}s ${removed ? 'unlisted' : 'updated'}${pages.length > 1 ? ` (${index + 1}/${pages.length})` : ''}`,
              },
            ],
          }
        : embedCard(description, {
            author: {
              iconURL: logoUrl(provider.provider_id, urls),
              name: `${truncateContent(provider.display_name, 120, 'batch.provider_name')}${dot}${truncateContent(provider.provider_id, 120, 'batch.provider_id')}`,
              url: gridUrl(provider.provider_id, urls),
            },
            color: colors.removed,
            footer: pages.length > 1 ? { text: `${index + 1}/${pages.length}` } : undefined,
            timestamp: first.event.observed_at,
          })),
    },
    source_ids,
  }))
}
