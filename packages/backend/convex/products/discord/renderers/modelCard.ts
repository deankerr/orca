import type { AlertFact, EntityAlert } from '../../shared/alerts/curate'
import { findFact } from '../../shared/alerts/present'
import { embedCard, gridUrl, lifecycleColor, logoUrl } from './card'
import type { Card, DiscordUrls } from './card'
import { bulletList, dot, escape, isDiscovery, lifecycleMarker, stackRows } from './display'
import { fieldChange, quote } from './fields'

type ModelAlert = Extract<EntityAlert, { entity_kind: 'model' }>

/** Arrivals describe the model; updates list changes; departures only announce absence. */
export function modelCard(event: ModelAlert, urls: DiscordUrls): Card {
  const { model } = event.context
  const slug = model.model_id

  return embedCard(modelContent(event).filter(Boolean).join('\n\n'), {
    author: { iconURL: logoUrl(slug, urls), name: slug, url: gridUrl(slug, urls) },
    color: lifecycleColor(event),
    timestamp: event.observed_at,
    // A discovery is introduced by name alone in the title; the details say what the model is.
    title: isDiscovery(event) ? `${lifecycleMarker(event)}${model.display_name}` : undefined,
  })
}

function modelContent(event: ModelAlert): string[] {
  const name = `**${escape(event.context.model.display_name)}**`

  if ('after' in event) {
    return [
      isDiscovery(event) ? '' : `Model ${name} now has listed endpoints.`,
      modelDetails(event.after),
    ]
  }

  if ('before' in event) {
    return [`Model ${name} has no more listed endpoints.`]
  }

  return [
    `Model ${name} updated.`,
    stackRows(
      event.changes.map((change) =>
        change.field === 'warning_message'
          ? fieldChange(change, { label: '⚠ warning_message' })
          : fieldChange(change),
      ),
    ),
  ]
}

/** Facts as bullets directly above the description, then any warning. */
function modelDetails(facts: readonly AlertFact[]): string {
  const description = findFact(facts, 'description', 'prose')?.value
  const warning = findFact(facts, 'warning_message', 'prose')?.value
  const cutoff = findFact(facts, 'knowledge_cutoff', 'text')?.value

  return stackRows([
    bulletList([
      modalitiesSummary(facts),
      cutoff === undefined || cutoff === null ? '' : `**Knowledge cutoff** ${escape(cutoff)}`,
    ]),
    description === undefined || description === null ? '' : quote(description),
    warning === undefined || warning === null ? '' : `**⚠ Warning**\n${quote(warning)}`,
  ])
}

/** `**Modalities** image, text → text • reasoning`; a missing side keeps the other labelled. */
function modalitiesSummary(facts: readonly AlertFact[]): string {
  const side = (field: string) => {
    const value = findFact(facts, field, 'list')?.value

    return value === undefined || value === null || value.length === 0
      ? undefined
      : value.map(escape).join(', ')
  }

  const [inputs, outputs] = [side('input_modalities'), side('output_modalities')]

  const modalities =
    inputs !== undefined && outputs !== undefined
      ? [`**Modalities** ${inputs} → ${outputs}`]
      : [
          inputs === undefined ? '' : `**Input** ${inputs}`,
          outputs === undefined ? '' : `**Output** ${outputs}`,
        ]

  return [
    ...modalities,
    findFact(facts, 'supports_reasoning', 'flag')?.value === true ? 'reasoning' : '',
  ]
    .filter(Boolean)
    .join(dot)
}
