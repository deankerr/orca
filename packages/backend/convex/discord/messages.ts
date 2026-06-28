// Builds Discord embeds from EntityChange[].
//
// Uses shared groupChanges to bucket changes into message-level groups,
// then builds embeds for each group. Embeds use author/footer icon slots
// to show entity branding.

import { EmbedBuilder } from '@discordjs/builders'

import { computeDelta, fmtValue, formatPricingFields, splitPath } from '../../shared/formatters'
import { groupChanges } from '../../shared/groups'
import { isNonEmptyString, truncate } from '../../shared/utils'
import type {
  EndpointChange,
  EntityChange,
  FieldChange,
  ModelChange,
  ModelRef,
  ProviderChange,
} from '../changes'
import { COLORS } from './constants'
import { getAuthorUrl, getLogoIconUrl } from './utils'

// -- Characters and symbols

const TRUNCATE_LENGTH = 800

function isLong(value: unknown) {
  return typeof value === 'string' && value.length > 80
}

function blockquote(text: string): string {
  return `> ${truncate(text, TRUNCATE_LENGTH).replaceAll('\n', '\n> ')}`
}

const CHARS = {
  new: ' 🆕 ',
  cross: ' ❌ ',
  skull: ' ☠️ ',
  sparkles: ' ✨ ',
  arrow: ' → ',
  deltaUpGood: ' \u{25B2} ',
  deltaDownGood: ' \u{25BC} ',
  deltaUpBad: ' \u{1F53A} ',
  deltaDownBad: ' \u{1F53B} ',
  dot: ' • ',
  bullet: '-',
} as const

// -- Public API

type DiscordMessage = {
  slug: string
  embeds: EmbedBuilder[]
}

export function buildMessages(changes: EntityChange[]): DiscordMessage[] {
  const groups = groupChanges(changes)

  return groups.flatMap(({ slug, changes: groupedChanges }) => {
    const embeds = groupedChanges.flatMap((change) => {
      const embed = buildEmbed(change)
      return embed ? [embed] : []
    })
    if (embeds.length === 0) {
      return []
    }
    return [{ slug, embeds }]
  })
}

function buildEmbed(change: EntityChange): EmbedBuilder | null {
  if (change.entity_type === 'model') {
    return buildModelEmbed(change)
  }
  if (change.entity_type === 'endpoint') {
    return buildEndpointEmbed(change)
  }
  return buildProviderEmbed(change)
}

// -- Model embeds

function modelAuthor(model: ModelChange) {
  return {
    name: model.model.slug,
    iconURL: getLogoIconUrl(model.model.slug),
    url: getAuthorUrl(model.model.slug),
  }
}

function buildModelEmbed(model: ModelChange): EmbedBuilder | null {
  const title = model.model.name ?? model.model.slug
  const author = modelAuthor(model)

  if (model.event.kind === 'entity_available') {
    const embed = new EmbedBuilder()
      .setColor(COLORS.create)
      .setTitle(`${title}${CHARS.sparkles}`)
      .setAuthor(author)
    if (isNonEmptyString(model.model.description)) {
      embed.setDescription(blockquote(model.model.description))
    }
    const fields = getNewModelFields(model.model)
    if (fields.length > 0) {
      embed.setFields(fields)
    }
    return embed
  }

  if (model.event.kind === 'entity_unavailable') {
    return new EmbedBuilder()
      .setColor(COLORS.delete)
      .setTitle(`${title}${CHARS.skull}`)
      .setAuthor(author)
      .setDescription('- This model has no more available endpoints!')
  }

  // entity_updated
  const desc = formatFieldChanges(model.event.fields)
  if (desc === null) {
    return null
  }
  return new EmbedBuilder()
    .setColor(COLORS.update)
    .setTitle(title)
    .setAuthor(author)
    .setDescription(desc)
}

// -- Endpoint embeds

function endpointAuthor(ep: EndpointChange) {
  return {
    name: ep.model.slug,
    iconURL: getLogoIconUrl(ep.model.slug),
    url: getAuthorUrl(ep.model.slug, ep.endpoint.uuid),
  }
}

function endpointFooter(ep: EndpointChange, cross = false) {
  return {
    text: cross ? `${ep.provider.slug}${CHARS.cross}` : ep.provider.slug,
    iconURL: getLogoIconUrl(ep.provider.slug),
  }
}

function buildEndpointEmbed(ep: EndpointChange): EmbedBuilder | null {
  const author = endpointAuthor(ep)

  if (ep.event.kind === 'entity_available') {
    const embed = new EmbedBuilder()
      .setColor(COLORS.create)
      .setAuthor(author)
      .setFooter(endpointFooter(ep))
      .setDescription('- endpoint discovered')
    const fields = getNewEndpointFields(ep)
    if (fields.length > 0) {
      embed.setFields(fields)
    }
    return embed
  }

  if (ep.event.kind === 'entity_unavailable') {
    return new EmbedBuilder()
      .setColor(COLORS.delete)
      .setAuthor(author)
      .setFooter(endpointFooter(ep, true))
      .setDescription('- endpoint has become unavailable')
  }

  // entity_updated
  const desc = formatFieldChanges(ep.event.fields)
  if (desc === null) {
    return null
  }
  return new EmbedBuilder()
    .setColor(COLORS.update)
    .setAuthor(author)
    .setFooter(endpointFooter(ep))
    .setDescription(desc)
}

// -- Provider embeds

function buildProviderEmbed(provider: ProviderChange): EmbedBuilder | null {
  const name = provider.provider.name ?? provider.provider.slug
  const author = {
    name: provider.provider.slug,
    iconURL: getLogoIconUrl(provider.provider.slug),
  }

  if (provider.event.kind === 'entity_available') {
    return new EmbedBuilder()
      .setColor(COLORS.create)
      .setAuthor(author)
      .setDescription(`${name} — provider discovered`)
  }

  if (provider.event.kind === 'entity_unavailable') {
    return new EmbedBuilder()
      .setColor(COLORS.delete)
      .setAuthor(author)
      .setDescription(`${name} — provider has become unavailable`)
  }

  // entity_updated
  const desc = formatFieldChanges(provider.event.fields)
  if (desc === null) {
    return null
  }
  return new EmbedBuilder()
    .setColor(COLORS.update)
    .setAuthor(author)
    .setTitle(name)
    .setDescription(desc)
}

// -- New entity fields

type EmbedField = { name: string; value: string; inline: boolean }

function getNewModelFields(model: ModelRef): EmbedField[] {
  const fields: EmbedField[] = []

  if (model.input_modalities && model.output_modalities) {
    const parts: string[] = [
      `${model.input_modalities.join(', ')} ${CHARS.arrow} ${model.output_modalities.join(', ')}`,
    ]
    if (model.reasoning === true) {
      parts.push('reasoning')
    }
    fields.push({ name: 'modalities', value: parts.join(CHARS.dot), inline: false })
  }

  if (isNonEmptyString(model.warning_message)) {
    fields.push({
      name: 'warning_message',
      value: blockquote(model.warning_message),
      inline: false,
    })
  }
  if (isNonEmptyString(model.promotion_message)) {
    fields.push({
      name: 'promotion_message',
      value: blockquote(model.promotion_message),
      inline: false,
    })
  }

  return fields
}

function getNewEndpointFields(ep: EndpointChange): EmbedField[] {
  const fields: EmbedField[] = []
  const ref = ep.endpoint

  if (ref.context_length !== undefined && ref.context_length !== null && ref.context_length !== 0) {
    const ctx =
      ref.max_output === ref.context_length
        ? ref.context_length.toLocaleString()
        : `${ref.context_length.toLocaleString()} (max: ${ref.max_output?.toLocaleString()})`
    fields.push({ name: 'context_length', value: ctx, inline: true })
  }

  if (ref.pricing) {
    for (const result of formatPricingFields(ref.pricing)) {
      const name = result.field.startsWith('text_cache_') ? result.field.slice(5) : result.field
      fields.push({ name, value: result.value, inline: true })
    }
  }

  return fields
}

// -- Field change formatting
//
// Takes FieldChange[] and returns a formatted description string,
// grouped by category (pricing, limits, data_policy, etc.)

function formatFieldChanges(fields: FieldChange[]): string | null {
  type Item = { category: string | null; key: string; content: string }
  const items: Item[] = []

  for (const field of fields) {
    const item = formatChangeItem(field)
    if (item) {
      items.push(item)
    }
  }

  if (items.length === 0) {
    return null
  }

  const grouped = Map.groupBy(items, (item) => item.category)
  const lines: string[] = []

  // top-level (no category) first
  const topLevel = grouped.get(null)
  if (topLevel) {
    for (const item of topLevel) {
      lines.push(`${item.key}:  ${item.content}`)
    }
  }

  // categorized groups: header + bulleted items
  for (const [category, catItems] of grouped) {
    if (category === null) {
      continue
    }
    const catLines = catItems.map((item) => `${CHARS.bullet} ${item.key}:  ${item.content}`)
    lines.push(`\n${category}\n${catLines.join('\n')}`)
  }

  return lines.join('\n')
}

function formatChangeItem(
  field: FieldChange,
): { category: string | null; key: string; content: string } | null {
  const { category, key: rawKey } = splitPath(field.path)
  const key = rawKey.startsWith('text_cache_') ? rawKey.slice(5) : rawKey
  const fmt = (v: unknown) => truncate(fmtValue(v, field.path), TRUNCATE_LENGTH)

  if (field.kind === 'set_updated') {
    const lines: string[] = []
    for (const item of field.items) {
      if (item.status === 'removed') {
        lines.push(`- ${item.value}`)
      }
      if (item.status === 'added') {
        lines.push(`+ ${item.value}`)
      }
    }
    if (lines.length === 0) {
      return null
    }
    return { category, key, content: `\n\`\`\`diff\n${lines.join('\n')}\n\`\`\`` }
  }

  if (field.kind === 'field_added') {
    if (isLong(field.value)) {
      return { category, key, content: `${CHARS.new}\n${blockquote(String(field.value))}` }
    }
    return { category, key, content: `${fmt(field.value)} ${CHARS.new}` }
  }

  if (field.kind === 'field_removed') {
    if (isLong(field.value)) {
      return { category, key, content: `${CHARS.cross}\n~~${blockquote(String(field.value))}~~` }
    }
    return { category, key, content: `~~${fmt(field.value)}~~ ${CHARS.cross}` }
  }

  // field_updated
  if (isLong(field.before) || isLong(field.after)) {
    const before =
      typeof field.before === 'string' ? truncate(field.before, TRUNCATE_LENGTH) : fmt(field.before)
    const after =
      typeof field.after === 'string' ? truncate(field.after, TRUNCATE_LENGTH) : fmt(field.after)
    return { category, key, content: `\n> ~~${before}~~\n> ${after}` }
  }

  const before = fmt(field.before)
  const after = fmt(field.after)
  const delta = fmtDelta(field.before, field.after, field.path)
  return { category, key, content: `~~${before}~~ ${CHARS.arrow} ${after} ${delta}` }
}

// -- Discord-specific delta formatting

function fmtDelta(before: unknown, after: unknown, path: string): string {
  const delta = computeDelta(before, after, path)
  if (!delta) {
    return ''
  }

  const symbol = delta.isUp
    ? delta.isGood
      ? CHARS.deltaUpGood
      : CHARS.deltaUpBad
    : delta.isGood
      ? CHARS.deltaDownGood
      : CHARS.deltaDownBad

  return `${symbol}${Math.abs(delta.pct).toFixed(0)}%`
}
