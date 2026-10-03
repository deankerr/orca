import type { EntityAlert, FieldValue } from '../../shared/curate'
import { colors, embedCard, componentCard, gridUrl, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { code, dot, escape, field, lifecycleMarker } from './display'
import { factsText, fieldChange, fieldValue, quote } from './fields'

/** Discoveries introduce models; known arrivals, updates and departures use compact cards. */
export function modelCard(
  event: Extract<EntityAlert, { entity_kind: 'model' }>,
  urls: DiscordUrls,
): Card {
  const { model } = event.context
  const name = model.display_name
  const slug = model.model_id
  const url = gridUrl(slug, urls)
  const logo = logoUrl(slug, urls)

  if ('after' in event && event.previously_known === false) {
    const content = [
      `### ${escape(name)} ✨\n[${escape(slug)}](${url})\nModel discovered.`,
      modelDetails(event.after),
      `-# <t:${Math.floor(Date.parse(event.observed_at) / 1000)}:f>`,
    ]
      .filter(Boolean)
      .join('\n\n')

    return componentCard(content, {
      color: colors.added,
      thumbnail: { url: logo, description: `${name} logo` },
    })
  }

  const content =
    'after' in event
      ? [`Model **${escape(name)}** now has listed endpoints.`, modelDetails(event.after)]
      : 'before' in event
        ? [
            `Model **${escape(name)}** has no more listed endpoints.`,
            'Last known model details:',
            modelDetails(event.before),
          ]
        : [
            `Model **${escape(name)}** updated.`,
            ...event.changes.map(
              (change) =>
                `${change.path === 'warning_message' ? '⚠ ' : ''}${fieldChange(change, {
                  prose: change.path === 'description' || change.path === 'warning_message',
                })}`,
            ),
          ]

  return embedCard(lifecycleMarker(event) + content.filter(Boolean).join('\n\n'), {
    author: { name: slug, url, iconURL: logo },
    timestamp: event.observed_at,
    color: 'after' in event ? colors.added : 'before' in event ? colors.removed : colors.updated,
  })
}

/** Model facts in display order; all field-specific choices stay beside the card. */
function modelDetails(facts: Record<string, FieldValue>): string {
  const inputs = facts.input_modalities
  const outputs = facts.output_modalities

  const modalities =
    Array.isArray(inputs) && Array.isArray(outputs)
      ? `${fieldValue(inputs)} → ${fieldValue(outputs)}`
      : factsText(facts, ['input_modalities', 'output_modalities'])

  return [
    [modalities, facts.supports_reasoning === true ? code('reasoning') : '']
      .filter(Boolean)
      .join(dot),
    typeof facts.description === 'string' && facts.description.trim() !== ''
      ? quote(facts.description)
      : '',
    factsText(facts, ['knowledge_cutoff']),
    typeof facts.warning_message === 'string' && facts.warning_message.trim() !== ''
      ? `⚠ ${field('warning_message', quote(facts.warning_message), { layout: 'block' })}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}
