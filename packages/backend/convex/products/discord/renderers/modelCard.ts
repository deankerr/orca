import type { AlertFact, EntityAlert } from '../../shared/alerts/curate'
import { fact } from '../../shared/alerts/facts'
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
      (change) => `${change.field === 'warning_message' ? '⚠ ' : ''}${fieldChange(change)}`,
    ),
  ]
}

/** Model facts in display order; all field-specific choices stay beside the card. */
function modelDetails(facts: readonly AlertFact[]): string {
  const inputs = fact(facts, 'input_modalities', 'list')
  const outputs = fact(facts, 'output_modalities', 'list')
  const description = fact(facts, 'description', 'prose')?.value
  const warning = fact(facts, 'warning_message', 'prose')?.value

  const modalities =
    inputs?.value && outputs?.value
      ? `${fieldValue(inputs)} → ${fieldValue(outputs)}`
      : factsText(facts, ['input_modalities', 'output_modalities'])

  return [
    [modalities, fact(facts, 'supports_reasoning', 'flag')?.value === true ? code('reasoning') : '']
      .filter(Boolean)
      .join(dot),
    description === undefined || description === null ? '' : quote(description),
    factsText(facts, ['knowledge_cutoff']),
    warning === undefined || warning === null
      ? ''
      : `⚠ ${field('warning_message', quote(warning), { layout: 'block' })}`,
  ]
    .filter(Boolean)
    .join('\n\n')
}
