import { EmbedBuilder } from '@discordjs/builders'

import type { ModelChange } from '../../alerts/inputs'
import { truncate } from '../../shared/utils'
import { COLORS, EMOJIS, MAX_DESCRIPTION_LENGTH } from '../constants'
import {
  buildEntityLinks,
  formatArrayDiff,
  formatValue,
  getColorIconUrl,
  getFieldLabel,
  isMissing,
  mono,
  type EmbedResult,
} from './utils'

function formatModalities(modalities: string[]): string {
  return modalities.join(', ') || 'none'
}

function formatDescription(description: string): string {
  // double single newlines for proper paragraph spacing in Discord
  return description.replace(/(?<!\n)\n(?!\n)/g, '\n\n')
}

function buildModelFields(change: ModelChange) {
  const { model_slug, model } = change
  const fields: { name: string; value: string; inline: boolean }[] = []

  // Standard header: model_id
  fields.push({
    name: 'model_id',
    value: mono(model_slug),
    inline: false,
  })

  if (model?.input_modalities?.length) {
    fields.push({
      name: 'input',
      value: mono(formatModalities(model.input_modalities)),
      inline: true,
    })
  }

  if (model?.output_modalities?.length) {
    fields.push({
      name: 'output',
      value: mono(formatModalities(model.output_modalities)),
      inline: true,
    })
  }

  // Always show reasoning field
  fields.push({
    name: 'reasoning',
    value: model?.reasoning ? EMOJIS.checkmark : EMOJIS.cross,
    inline: true,
  })

  if (model?.tokenizer) {
    fields.push({
      name: 'tokenizer',
      value: mono(model.tokenizer),
      inline: true,
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

  return fields
}

function buildBaseEmbed(change: ModelChange): EmbedResult {
  const { model_slug, model, change_kind, crawl_id } = change

  const embed = new EmbedBuilder()
    .setColor(COLORS[change_kind])
    .setTimestamp(new Date(parseInt(crawl_id)))
    .setAuthor({
      name: model_slug,
      iconURL: getColorIconUrl(model_slug),
    })

  // Set title based on change kind
  switch (change_kind) {
    case 'create':
      embed.setTitle(model?.name ? `${model.name} ${EMOJIS.new}` : EMOJIS.new)
      break
    case 'update':
      embed.setTitle(model?.name ?? null)
      break
    case 'delete':
      embed.setTitle(`~~${model?.name ?? model_slug}~~ ${EMOJIS.delete}`)
      break
  }

  // Add description for create/delete
  if (change_kind !== 'update' && model?.description) {
    const formatted = formatDescription(model.description)
    embed.setDescription(truncate(formatted, MAX_DESCRIPTION_LENGTH))
  }

  const fields = buildModelFields(change)
  embed.setFields(fields)

  const links = buildEntityLinks({
    model_slug,
    hugging_face_id: model?.hugging_face_id,
  })
  embed.addFields({ name: 'links', value: links, inline: false })

  return embed.toJSON()
}

function buildUpdateEmbed(changes: ModelChange[]): EmbedResult {
  const first = changes[0]!
  const { model_slug, model, crawl_id } = first

  const embed = new EmbedBuilder()
    .setColor(COLORS.update)
    .setTimestamp(new Date(parseInt(crawl_id)))
    .setAuthor({
      name: model_slug,
      iconURL: getColorIconUrl(model_slug),
    })
    .setTitle(model?.name ?? null)

  const fields: { name: string; value: string; inline: boolean }[] = []

  // Standard header: model_id
  fields.push({
    name: 'model_id',
    value: mono(model_slug),
    inline: false,
  })

  // Field changes from all update records
  const fieldChanges = changes.filter((c) => c.change_kind === 'update')

  for (const change of fieldChanges) {
    const field = change.path_level_2 ?? change.path_level_1 ?? 'unknown'
    const label = getFieldLabel(field, change.before, change.after)
    const isNew = isMissing(change.before)
    const isRemoved = isMissing(change.after)

    // Array diffs
    if (Array.isArray(change.before) && Array.isArray(change.after)) {
      const diff = formatArrayDiff(change.before, change.after)
      if (diff) {
        fields.push({
          name: label,
          value: diff,
          inline: false,
        })
      }
      continue
    }

    // Simple value changes
    const beforeStr = formatValue(change.before)
    const afterStr = formatValue(change.after)

    let value: string
    if (isNew) {
      value = mono(afterStr)
    } else if (isRemoved) {
      value = mono(beforeStr)
    } else {
      value = `${mono(beforeStr)} ${EMOJIS.arrow} ${mono(afterStr)}`
    }

    fields.push({ name: label, value, inline: false })
  }

  embed.setFields(fields)

  const links = buildEntityLinks({
    model_slug,
    hugging_face_id: model?.hugging_face_id,
  })
  embed.addFields({ name: 'links', value: links, inline: false })

  return embed.toJSON()
}

export function buildModelEmbed(changes: ModelChange[]): EmbedResult {
  const first = changes[0]
  if (!first) throw new Error('buildModelEmbed requires at least one change')

  // Updates show field-level diffs, create/delete show full model state
  if (first.change_kind === 'update') {
    return buildUpdateEmbed(changes)
  }

  return buildBaseEmbed(first)
}
