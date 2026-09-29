import { withoutSystemFields } from 'convex-helpers'
import { ConvexError, v } from 'convex/values'
import type { Infer } from 'convex/values'
import { isDeepEqual } from 'remeda'
import { z } from 'zod'

import { event } from '../events/query'
import type { EventRow } from '../events/query'

const atom = v.union(v.null(), v.string(), v.number(), v.boolean(), v.array(v.string()))
const value = v.union(atom, v.record(v.string(), atom))
const fieldChange = v.union(
  v.object({ type: v.literal('field_updated'), path: v.string(), before: value, after: value }),
  v.object({ type: v.literal('field_added'), path: v.string(), after: value }),
  v.object({ type: v.literal('field_removed'), path: v.string(), before: value }),
  v.object({
    type: v.literal('set_updated'),
    path: v.string(),
    added: v.array(v.string()),
    removed: v.array(v.string()),
  }),
)

export const curatedEvent = v.union(
  ...event.members.flatMap((member) => {
    const kind = member.fields.entity_kind.value
    const identity = member.omit('change_json', 'type', 'scan_at').extend({
      observed_at: v.string(),
    })
    return [
      identity.extend({ type: v.literal(`${kind}_updated`), changes: v.array(fieldChange) }),
      identity.extend({
        type: v.literal(`${kind}_added`),
        after: v.record(v.string(), value),
      }),
      identity.extend({
        type: v.literal(`${kind}_removed`),
        before: v.record(v.string(), value),
      }),
    ]
  }),
)
export type CuratedEvent = Infer<typeof curatedEvent>
export type FieldChange = Infer<typeof fieldChange>
export type FieldValue = Infer<typeof value>
type Selection = Record<string, true | readonly string[]>

const fields = (...names: string[]): Record<string, true> =>
  Object.fromEntries(names.map((name) => [name, true]))

/** Public facts use upstream names; these selections also curate lifecycle values. */
const selections: Record<EventRow['entity_kind'], Selection> = {
  model: {
    ...fields(
      'id',
      'slug',
      'permaslug',
      'variant',
      'short_name',
      'created_at',
      'input_modalities',
      'output_modalities',
      'description',
      'author_display_name',
      'hf_slug',
      'knowledge_cutoff',
      'supports_reasoning',
    ),
    reasoning_config: ['is_mandatory_reasoning', 'supported_reasoning_efforts'],
  },
  provider: {
    ...fields('provider_id', 'displayName', 'headquarters', 'datacenters', 'statusPageUrl'),
    dataPolicy: ['termsOfServiceURL', 'privacyPolicyURL'],
  },
  endpoint: {
    ...fields(
      'id',
      'model_id',
      'provider_id',
      'provider_tag',
      'provider_display_name',
      'variant',
      'context_length',
      'max_completion_tokens',
      'max_prompt_tokens',
      'max_tokens_per_image',
      'max_prompt_images',
      'limit_rpm',
      'limit_rpd',
      'quantization',
      'supported_parameters',
      'supports_reasoning',
      'has_completions',
      'has_chat_completions',
      'moderation_required',
      'is_deranked',
      'is_disabled',
    ),
    pricing: [
      'prompt',
      'completion',
      'input_cache_read',
      'input_cache_write',
      'audio',
      'input_audio_cache',
      'image',
      'image_output',
      'web_search',
      'discount',
    ],
    features: ['supports_implicit_caching', 'supports_native_web_search'],
    data_policy: ['training', 'canPublish', 'requiresUserIDs', 'retainsPrompts', 'retentionDays'],
  },
}

const Atom = z.union([z.null(), z.string(), z.number(), z.boolean(), z.array(z.string())])
const ObjectValue = z.record(z.string(), z.json())
const Change = z.object({
  key: z.string(),
  type: z.enum(['ADD', 'REMOVE', 'UPDATE']),
  value: z.json().optional(),
  oldValue: z.json().optional(),
  embeddedKey: z.string().optional(),
  get changes() {
    return z.array(Change).optional()
  },
})
type Change = z.infer<typeof Change>
const ContainerChange = Change.extend({ type: z.literal('UPDATE'), changes: z.array(Change) })

function nativePath(kind: EventRow['entity_kind'], path: string[]): string[] {
  if (path[0] === 'metadata') {
    return path.slice(1)
  }
  if (path[0] === 'pricing' && path[1] === 'meters') {
    return ['pricing', ...path.slice(2)]
  }
  const [key, ...rest] = path
  if (kind === 'model') {
    if (key === 'model_id') {
      return ['id', ...rest]
    }
    if (key === 'display_name') {
      return ['short_name', ...rest]
    }
    if (key === 'or_created_at') {
      return ['created_at', ...rest]
    }
  }
  if (kind === 'provider' && key === 'display_name') {
    return ['displayName', ...rest]
  }
  if (kind === 'endpoint' && key === 'endpoint_id') {
    return ['id', ...rest]
  }
  return path
}

function selectValue(input: unknown, selection: true | readonly string[]): Infer<typeof value> {
  if (selection === true || input === null || typeof input !== 'object' || Array.isArray(input)) {
    return Atom.parse(input)
  }
  const source = ObjectValue.parse(input)
  return Object.fromEntries(
    selection.flatMap((key) =>
      Object.hasOwn(source, key) ? [[key, Atom.parse(source[key])]] : [],
    ),
  )
}

function fieldSelection(kind: EventRow['entity_kind'], path: string[]) {
  const [key, child] = path
  if (key === undefined || !Object.hasOwn(selections[kind], key)) {
    return undefined
  }
  const group = selections[kind][key]
  if (path.length === 1) {
    return group
  }
  return path.length === 2 &&
    group !== undefined &&
    group !== true &&
    child !== undefined &&
    group.includes(child)
    ? true
    : undefined
}

function selectedChanges(
  kind: EventRow['entity_kind'],
  node: Change,
  parent: string[],
): FieldChange[] {
  const sourcePath = [...parent, node.key]
  const path = nativePath(kind, sourcePath)
  // Metadata and meters are guaranteed containers in the stored entity projection.
  if (
    path.length === 0 ||
    (sourcePath[0] === 'pricing' && sourcePath[1] === 'meters' && sourcePath.length === 2)
  ) {
    return ContainerChange.parse(node).changes.flatMap((child) =>
      selectedChanges(kind, child, sourcePath),
    )
  }
  const selection = fieldSelection(kind, path)
  if (selection === undefined) {
    return []
  }

  if (node.changes !== undefined) {
    if (selection !== true) {
      return node.changes.flatMap((nested) => selectedChanges(kind, nested, sourcePath))
    }
    if (
      node.embeddedKey !== '$value' ||
      node.changes.some((item) => item.type !== 'ADD' && item.type !== 'REMOVE')
    ) {
      throw new ConvexError({
        message: 'Selected event field has an unsupported change shape',
        path: path.join('.'),
      })
    }
    return [
      {
        type: 'set_updated',
        path: path.join('.'),
        added: node.changes
          .filter((item) => item.type === 'ADD')
          .map((item) => z.string().parse(item.value)),
        removed: node.changes
          .filter((item) => item.type === 'REMOVE')
          .map((item) => z.string().parse(item.value)),
      },
    ]
  }

  const before =
    node.type === 'ADD'
      ? undefined
      : selectValue(node.type === 'REMOVE' ? node.value : node.oldValue, selection)
  const after = node.type === 'REMOVE' ? undefined : selectValue(node.value, selection)
  if (isDeepEqual(before, after)) {
    return []
  }
  const field = path.join('.')
  if (after === undefined) {
    if (before === undefined) {
      return []
    }
    return [{ type: 'field_removed', path: field, before }]
  }
  return before === undefined
    ? [{ type: 'field_added', path: field, after }]
    : [{ type: 'field_updated', path: field, before, after }]
}

function entityValue(
  kind: EventRow['entity_kind'],
  input: unknown,
): Record<string, Infer<typeof value>> {
  const source = ObjectValue.parse(input)
  const native: Record<string, unknown> = { ...ObjectValue.parse(source.metadata), ...source }
  for (const [key, field] of Object.entries(source)) {
    const [name] = nativePath(kind, [key])
    if (name !== undefined) {
      native[name] = field
    }
  }
  if (kind === 'endpoint') {
    const pricing = ObjectValue.parse(source.pricing)
    native.pricing = { ...pricing, ...ObjectValue.parse(pricing.meters) }
  }
  return Object.fromEntries(
    Object.entries(selections[kind]).flatMap(([key, selection]) =>
      Object.hasOwn(native, key) ? [[key, selectValue(native[key], selection)]] : [],
    ),
  )
}

/** Interpret captured facts only; curation never reads current Catalog or modifies stored events. */
export function curate(row: EventRow): CuratedEvent | null {
  const { change_json, type, scan_at, ...subject } = withoutSystemFields(row)
  const identity = { ...subject, observed_at: scan_at }
  const change = Change.parse(JSON.parse(change_json))
  if (change.key !== row.entity_id || change.type !== type) {
    throw new ConvexError({
      message: 'Event payload does not match its stored identity and operation',
      entity_id: row.entity_id,
      type,
    })
  }
  if (type === 'ADD') {
    return {
      ...identity,
      type: `${row.entity_kind}_added`,
      after: entityValue(row.entity_kind, change.value),
    }
  }
  if (type === 'REMOVE') {
    return {
      ...identity,
      type: `${row.entity_kind}_removed`,
      before: entityValue(row.entity_kind, change.value),
    }
  }
  const changes = ContainerChange.parse(change).changes.flatMap((child) =>
    selectedChanges(row.entity_kind, child, []),
  )
  return changes.length === 0 ? null : { ...identity, type: `${row.entity_kind}_updated`, changes }
}
