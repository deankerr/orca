import type { EntityAlert, FieldValue } from '../../shared/alerts/curate'
import { colors, embedCard, componentCard, gridUrl, lifecycleColor, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { code, dot, escape, field, lifecycleMarker } from './display'
import { factsText, fieldChange, fieldValue, quote } from './fields'

type ModelAlert = Extract<EntityAlert, { entity_kind: 'model' }>

/** Discoveries introduce models; known arrivals, updates and departures use compact cards. */
export function modelCard(event: ModelAlert, urls: DiscordUrls): Card {
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
      thumbnail: { description: `${name} logo`, url: logo },
    })
  }

  return embedCard(lifecycleMarker(event) + compactContent(event).filter(Boolean).join('\n\n'), {
    author: { iconURL: logo, name: slug, url },
    color: lifecycleColor(event),
    timestamp: event.observed_at,
  })
}

function compactContent(event: ModelAlert): string[] {
  const name = escape(event.context.model.display_name)

  if ('after' in event) {
    return [`Model **${name}** now has listed endpoints.`, modelDetails(event.after)]
  }

  if ('before' in event) {
    return [
      `Model **${name}** has no more listed endpoints.`,
      Object.keys(event.before).length > 0 ? 'Last known model details:' : '',
      modelDetails(event.before),
    ]
  }

  return [
    `Model **${name}** updated.`,
    ...event.changes.map(
      (change) =>
        `${change.path === 'warning_message' ? '⚠ ' : ''}${fieldChange(change, {
          prose: change.path === 'description' || change.path === 'warning_message',
        })}`,
    ),
  ]
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
