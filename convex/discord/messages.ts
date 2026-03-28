// Builds Discord messages from ChangeGroups.
//
// A ChangeGroup maps to one Discord message (which can contain multiple embeds).
// For example, a new model produces a model embed + an embed per endpoint child,
// all in a single message.
//
// Entity data (names, descriptions, pricing) comes from the enriched refs on
// each ORCAChange, not from the group itself.
//
// Descriptions are built as string[] buffers — each section pushes content
// with embedded newlines as needed, then joined at the end.

import { EmbedBuilder } from '@discordjs/builders'

import type { ChangeGroup, EndpointChangeGroup, ModelChangeGroup } from '../changeBatch'
import type { EndpointRef, ModelRef, ORCAChange } from '../db/or/views/changes'
import { computeDelta, fmtValue, formatPricingFields, splitPath } from '../shared/formatters'
import { truncate } from '../shared/utils'
import { COLORS } from './constants'
import { getAuthorUrl, getColorIconUrl } from './utils'

// -- Characters and symbols

const TRUNCATE_LENGTH = 800

// truncate and blockquote a long string, preserving line breaks
function blockquote(text: string): string {
  return `> ${truncate(text, TRUNCATE_LENGTH).replace(/\n/g, '\n> ')}`
}

const CHARS = {
  new: ' 🆕 ',
  cross: ' ❌ ',
  skull: ' ☠️ ',
  sparkles: ' ✨ ',
  arrow: ' → ',
  deltaUpGood: ' \u{25B2} ',
  deltaDownGood: ' \u{25BC} ',
  deltaUpBad: ' \u{1F53A} ',
  deltaDownBad: ' \u{1F53B} ',
  dot: ' • ',
  bullet: '-',
} as const

// -- Ref extraction helpers
//
// Groups carry changes with enriched refs. We grab the first change's ref
// to access entity metadata (name, description, pricing, etc.)

function getModelRef(group: ModelChangeGroup): ModelRef {
  const allChanges = [...group.changes, ...group.children.flatMap((c) => c.changes)]
  const first = allChanges[0]
  if (!first) return { slug: group.slug }
  if (first.entity_type === 'model') return first.model
  if (first.entity_type === 'endpoint') return first.model
  return { slug: group.slug }
}

function getEndpointRef(child: EndpointChangeGroup): EndpointRef {
  for (const c of child.changes) {
    if (c.entity_type === 'endpoint') return c.endpoint
  }
  return { uuid: child.uuid }
}

// -- Public API

export function buildMessage(group: ChangeGroup): EmbedBuilder[] | null {
  if (group.entity_type === 'model') return buildModelMessage(group)
  return null
}

// -- Model messages

function buildModelMessage(group: ModelChangeGroup): EmbedBuilder[] | null {
  const model = getModelRef(group)
  const action = detectLifecycle(group.changes)

  // each branch builds its own embed — no intermediate buffers
  const modelAuthor = {
    name: group.slug,
    iconURL: getColorIconUrl(group.slug),
    url: getAuthorUrl(group.slug),
  }
  const modelTitle = model.name ?? group.slug

  let modelEmbed: EmbedBuilder | null = null

  if (action === 'available') {
    modelEmbed = new EmbedBuilder()
      .setColor(COLORS.create)
      .setTitle(`${modelTitle}${CHARS.sparkles}`)
      .setAuthor(modelAuthor)
    if (model.description) modelEmbed.setDescription(blockquote(model.description))
    const fields = getNewModelFields(model)
    if (fields.length > 0) modelEmbed.setFields(fields)
  } else if (action === 'unavailable') {
    modelEmbed = new EmbedBuilder()
      .setColor(COLORS.delete)
      .setTitle(`${modelTitle}${CHARS.skull}`)
      .setAuthor(modelAuthor)
      .setDescription('- This model has no more available endpoints!')
  } else if (group.changes.length > 0) {
    const desc: string[] = []
    addChanges(desc, group.changes)
    if (desc.length > 0) {
      modelEmbed = new EmbedBuilder()
        .setColor(COLORS.update)
        .setTitle(modelTitle)
        .setAuthor(modelAuthor)
        .setDescription(desc.join('\n'))
    }
  }

  // unavailable: model embed goes last (after endpoint children)
  const embeds: EmbedBuilder[] = []
  if (modelEmbed && action !== 'unavailable') embeds.push(modelEmbed)
  for (const child of group.children) {
    embeds.push(buildEndpointEmbed(child))
  }
  if (modelEmbed && action === 'unavailable') embeds.push(modelEmbed)

  if (embeds.length === 0) return null
  return embeds
}

// -- Endpoint embeds

function buildEndpointEmbed(child: EndpointChangeGroup): EmbedBuilder {
  const action = detectLifecycle(child.changes)

  const epAuthor = {
    name: child.model_slug,
    iconURL: getColorIconUrl(child.model_slug),
    url: getAuthorUrl(child.model_slug, child.uuid),
  }
  const epFooter = {
    text: action === 'unavailable' ? `${child.provider_slug}${CHARS.cross}` : child.provider_slug,
    iconURL: getColorIconUrl(child.provider_slug),
  }

  if (action === 'available') {
    const embed = new EmbedBuilder()
      .setColor(COLORS.create)
      .setAuthor(epAuthor)
      .setFooter(epFooter)
      .setDescription('- endpoint discovered')
    const fields = getNewEndpointFields(getEndpointRef(child))
    if (fields.length > 0) embed.setFields(fields)
    return embed
  }

  if (action === 'unavailable') {
    return new EmbedBuilder()
      .setColor(COLORS.delete)
      .setAuthor(epAuthor)
      .setFooter(epFooter)
      .setDescription('- endpoint has become unavailable')
  }

  // updates
  const desc: string[] = []
  addChanges(desc, child.changes)
  const embed = new EmbedBuilder().setColor(COLORS.update).setAuthor(epAuthor).setFooter(epFooter)
  if (desc.length > 0) embed.setDescription(desc.join('\n'))
  return embed
}

// -- New entity fields

type EmbedField = { name: string; value: string; inline: boolean }

function getNewModelFields(model: ModelRef): EmbedField[] {
  const fields: EmbedField[] = []

  if (model.input_modalities && model.output_modalities) {
    const parts: string[] = []
    parts.push(
      `${model.input_modalities.join(', ')} ${CHARS.arrow} ${model.output_modalities.join(', ')}`,
    )
    if (model.reasoning) parts.push('reasoning')
    fields.push({ name: 'modalities', value: parts.join(CHARS.dot), inline: false })
  }

  if (model.warning_message)
    fields.push({
      name: 'warning_message',
      value: blockquote(model.warning_message),
      inline: false,
    })
  if (model.promotion_message)
    fields.push({
      name: 'promotion_message',
      value: blockquote(model.promotion_message),
      inline: false,
    })

  return fields
}

function getNewEndpointFields(ep: EndpointRef): EmbedField[] {
  const fields: EmbedField[] = []

  if (ep.context_length) {
    const ctx =
      ep.max_output !== ep.context_length
        ? `${ep.context_length.toLocaleString()} (max: ${ep.max_output?.toLocaleString()})`
        : ep.context_length.toLocaleString()
    fields.push({ name: 'context_length', value: ctx, inline: true })
  }

  if (ep.pricing) {
    for (const result of formatPricingFields(ep.pricing)) {
      const name = result.field.startsWith('text_cache_') ? result.field.slice(5) : result.field
      fields.push({ name, value: result.value, inline: true })
    }
  }

  return fields
}

// -- Change description builder
//
// Groups changes by path category (pricing, limits, data_policy, etc.)
// and pushes formatted content to the description buffer.

type FieldAction = Exclude<
  ORCAChange['action'],
  { kind: 'entity_available' } | { kind: 'entity_unavailable' }
>

function addChanges(desc: string[], changes: ORCAChange[]): void {
  // collect items with their categories
  type Item = { category: string | null; key: string; content: string }
  const items: Item[] = []

  for (const change of changes) {
    const { action } = change
    if (action.kind === 'entity_available' || action.kind === 'entity_unavailable') continue

    const item = formatChangeItem(action)
    if (item) items.push(item)
  }

  // group by category — top-level fields first, then categorized
  const grouped = Map.groupBy(items, (item) => item.category)

  // top-level (no category) first
  const topLevel = grouped.get(null)
  if (topLevel) {
    for (const item of topLevel) desc.push(`${item.key}:  ${item.content}`)
  }

  // categorized groups: header + bulleted items
  for (const [category, catItems] of grouped) {
    if (category === null) continue
    const lines = catItems.map((item) => `${CHARS.bullet} ${item.key}:  ${item.content}`)
    desc.push(`\n${category}\n${lines.join('\n')}`)
  }
}

// -- Change item formatting
//
// Returns the key and formatted content for a single field change.
// Content may contain embedded newlines (diff blocks, long strings).
// The key is separated so the caller can apply its own prefix (bullet, etc.)

function formatChangeItem(
  action: FieldAction,
): { category: string | null; key: string; content: string } | null {
  const { category, key: rawKey } = splitPath(action.path)
  const key = rawKey.startsWith('text_cache_') ? rawKey.slice(5) : rawKey
  const isLong = (value: unknown) => typeof value === 'string' && value.length > 80

  // format a value with Discord-length truncation
  const fmt = (v: unknown) => truncate(fmtValue(v, action.path), TRUNCATE_LENGTH)

  // set changes use diff blocks
  if (action.kind === 'set_updated') {
    const lines: string[] = []
    for (const item of action.items) {
      if (item.status === 'removed') lines.push(`- ${item.value}`)
      if (item.status === 'added') lines.push(`+ ${item.value}`)
    }
    if (lines.length === 0) return null
    return { category, key, content: `\n\`\`\`diff\n${lines.join('\n')}\n\`\`\`` }
  }

  if (action.kind === 'field_added') {
    if (isLong(action.value))
      return { category, key, content: `${CHARS.new}\n${blockquote(String(action.value))}` }
    return { category, key, content: `${fmt(action.value)} ${CHARS.new}` }
  }

  if (action.kind === 'field_removed') {
    if (isLong(action.value))
      return { category, key, content: `${CHARS.cross}\n~~${blockquote(String(action.value))}~~` }
    return { category, key, content: `~~${fmt(action.value)}~~ ${CHARS.cross}` }
  }

  // field_updated — long strings get a single continuous blockquote
  if (isLong(action.before) || isLong(action.after)) {
    const before =
      typeof action.before === 'string'
        ? truncate(action.before, TRUNCATE_LENGTH)
        : fmt(action.before)
    const after =
      typeof action.after === 'string' ? truncate(action.after, TRUNCATE_LENGTH) : fmt(action.after)
    return { category, key, content: `\n> ~~${before}~~\n> ${after}` }
  }

  const before = fmt(action.before)
  const after = fmt(action.after)

  const delta = fmtDelta(action.before, action.after, action.path)
  return { category, key, content: `~~${before}~~ ${CHARS.arrow} ${after} ${delta}` }
}

// -- Discord-specific delta formatting

function fmtDelta(before: unknown, after: unknown, path: string): string {
  const delta = computeDelta(before, after, path)
  if (!delta) return ''

  const symbol = delta.isUp
    ? delta.isGood
      ? CHARS.deltaUpGood
      : CHARS.deltaUpBad
    : delta.isGood
      ? CHARS.deltaDownGood
      : CHARS.deltaDownBad

  return `${symbol}${Math.abs(delta.pct).toFixed(0)}%`
}

// -- Helpers

function detectLifecycle(changes: ORCAChange[]): 'available' | 'unavailable' | 'updates' {
  for (const c of changes) {
    if (c.action.kind === 'entity_available') return 'available'
    if (c.action.kind === 'entity_unavailable') return 'unavailable'
  }
  return 'updates'
}
