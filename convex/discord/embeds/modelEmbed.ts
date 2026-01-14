import { EmbedBuilder } from '@discordjs/builders'

import { Doc } from '../../_generated/dataModel'
import { truncate } from '../../shared/utils'
import { buildEntityLinks } from './components'
import {
  COLORS,
  EMOJIS,
  formatArrayDiff,
  formatValue,
  getColorIconUrl,
  getFieldLabel,
  isMissing,
  MAX_DESCRIPTION_LENGTH,
  mono,
  type EmbedResult,
  type FieldChange,
} from './utils'

type ModelData = Doc<'or_views_models'> & { description?: string }

function formatModalities(modalities: string[]): string {
  return modalities.join(', ') || 'none'
}

function formatDescription(description: string): string {
  // double single newlines for proper paragraph spacing in Discord
  return description.replace(/(?<!\n)\n(?!\n)/g, '\n\n')
}

function buildModelFields(model_slug: string, model: ModelData | null) {
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

function buildBaseEmbed(
  model_slug: string,
  model: ModelData | null,
  change_kind: 'create' | 'update' | 'delete',
): EmbedResult {
  const embed = new EmbedBuilder().setColor(COLORS[change_kind]).setAuthor({
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

  const fields = buildModelFields(model_slug, model)
  embed.setFields(fields)

  const links = buildEntityLinks({
    model_slug,
    hugging_face_id: model?.hugging_face_id,
  })

  return { embed: embed.toJSON(), links }
}

function buildUpdateEmbed(
  model_slug: string,
  model: ModelData | null,
  changes: FieldChange[],
): EmbedResult {
  const embed = new EmbedBuilder()
    .setColor(COLORS.update)
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

  for (const change of changes) {
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

  return { embed: embed.toJSON(), links }
}

export function buildModelEmbed(args: {
  model_slug: string
  change_kind: 'create' | 'update' | 'delete'
  model: ModelData | null
  changes?: FieldChange[]
}): EmbedResult {
  const { model_slug, change_kind, model, changes = [] } = args

  // Updates show field-level diffs, create/delete show full model state
  if (change_kind === 'update') {
    return buildUpdateEmbed(model_slug, model, changes)
  }

  return buildBaseEmbed(model_slug, model, change_kind)
}
