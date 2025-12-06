import { EmbedBuilder } from '@discordjs/builders'

import { truncate } from '../../../shared/utils'
import type { WebhookChange } from '../inputs'
import { buildLinks, getColorIconUrl } from './utils'

const MAX_DESCRIPTION_LENGTH = 900

function formatModalities(modalities: string[]): string {
  return modalities.join(', ') || 'none'
}

function formatDescription(description: string): string {
  // * double single newlines for proper paragraph spacing in Discord
  return description.replace(/(?<!\n)\n(?!\n)/g, '\n\n')
}

export function buildModelCreateEmbed(args: {
  change: WebhookChange & { entity_type: 'model'; change_kind: 'create' }
  providerSlugs: string[]
}): EmbedBuilder {
  const { change, providerSlugs } = args
  const model = change.model

  const embed = new EmbedBuilder()
    .setColor(0x22c55e) // green for new model
    .setAuthor({
      name: change.model_slug,
      iconURL: getColorIconUrl(change.model_slug),
    })
    .setFooter({
      text: `ORCA ${change.crawl_id}`,
    })
    .setTimestamp(new Date(parseInt(change.crawl_id)))

  // * title with model name
  if (model?.name) {
    embed.setTitle('🆕 ' + model.name)
  }

  // * description from or_sources + links
  const links = buildLinks(change.model_slug, model?.hugging_face_id)

  if (model?.description) {
    const formatted = formatDescription(model.description)
    embed.setDescription(`${truncate(formatted, MAX_DESCRIPTION_LENGTH)}\n\n${links}`)
  } else {
    embed.setDescription(links)
  }

  // * fields
  const fields: { name: string; value: string; inline: boolean }[] = []

  if (model?.input_modalities?.length) {
    fields.push({
      name: 'input',
      value: formatModalities(model.input_modalities),
      inline: true,
    })
  }

  if (model?.output_modalities?.length) {
    fields.push({
      name: 'output',
      value: formatModalities(model.output_modalities),
      inline: true,
    })
  }

  if (model?.reasoning) {
    fields.push({
      name: 'reasoning',
      value: 'true',
      inline: true,
    })
  }

  if (model?.tokenizer) {
    fields.push({
      name: 'tokenizer',
      value: model.tokenizer,
      inline: true,
    })
  }

  if (providerSlugs.length > 0) {
    fields.push({
      name: 'providers',
      value: providerSlugs.join(', '),
      inline: false,
    })
  }

  if (model?.warning_message) {
    fields.push({
      name: 'warning_message',
      value: model.warning_message,
      inline: false,
    })
  }

  if (model?.promotion_message) {
    fields.push({
      name: 'promotion_message',
      value: model.promotion_message,
      inline: false,
    })
  }

  if (fields.length > 0) {
    embed.setFields(fields)
  }

  return embed
}
