import { withoutSystemFields } from 'convex-helpers'
import { v } from 'convex/values'
import type { Infer } from 'convex/values'
import { isDeepEqual } from 'remeda'
import { z } from 'zod'

import { eventsTable } from '../../../catalog/tables/events'
import type { EventRow } from '../../../catalog/tables/events'
import type { JsonValue } from '../../../json'
import { decode } from './decode'
import type { CapturedChange, Snapshot } from './decode'
import { isScheduledPricing } from './pricing'

const atom = v.union(v.null(), v.string(), v.number(), v.boolean(), v.array(v.string()))
const value = v.union(atom, v.record(v.string(), atom))

const fieldChange = v.union(
  // Opaque changes are announced without projecting their arbitrary values into alerts.
  v.object({ path: v.string(), type: v.literal('field_changed') }),
  v.object({ after: value, before: value, path: v.string(), type: v.literal('field_updated') }),
  v.object({ after: value, path: v.string(), type: v.literal('field_added') }),
  v.object({ before: value, path: v.string(), type: v.literal('field_removed') }),
  v.object({
    added: v.array(v.string()),
    path: v.string(),
    removed: v.array(v.string()),
    type: v.literal('set_updated'),
  }),
)

export const entityAlert = v.union(
  ...eventsTable.validator.members.flatMap((member) => {
    const kind = member.fields.entity_kind.value

    const identity = member.omit('change_json', 'type', 'scan_at').extend({
      observed_at: v.string(),
      previously_known: v.optional(v.boolean()),
    })

    return [
      identity.extend({
        changes: v.array(fieldChange),
        /** Derived during alert preparation, never persisted on the event. */
        pricing_is_scheduled: v.optional(v.boolean()),
        type: v.literal(`${kind}_updated`),
      }),
      identity.extend({
        after: v.record(v.string(), value),
        type: v.literal(`${kind}_added`),
      }),
      identity.extend({
        before: v.record(v.string(), value),
        type: v.literal(`${kind}_removed`),
      }),
    ]
  }),
)

export type EntityAlert = Infer<typeof entityAlert>

export type FieldChange = Infer<typeof fieldChange>

export type FieldValue = Infer<typeof value>

type Selection = Record<string, true | readonly string[]>

const fields = (...names: string[]): Record<string, true> =>
  Object.fromEntries(names.map((name) => [name, true]))

/** Public facts use upstream names; these selections also curate lifecycle values. */
// oxlint-disable sort-keys -- Key order is the field order of curated added/removed snapshots (entityValue iterates it).
const selections: Record<EventRow['entity_kind'], Selection> = {
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
      'input_cache_write_1h',
      'audio',
      'input_audio_cache',
      'image',
      'image_output',
      'web_search',
      'discount',
      'is_scheduled',
    ],
    features: ['supports_native_web_search'],
    data_policy: ['training', 'canPublish', 'requiresUserIDs', 'retainsPrompts', 'retentionDays'],
  },
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
      'warning_message',
      'author_display_name',
      'hf_slug',
      'knowledge_cutoff',
      'supports_reasoning',
    ),
    reasoning_config: ['is_mandatory_reasoning', 'supported_reasoning_efforts'],
  },
  provider: {
    ...fields(
      'provider_id',
      'displayName',
      'headquarters',
      'datacenters',
      'statusPageUrl',
      'hasChatCompletions',
      'hasCompletions',
      'byokEnabled',
    ),
    dataPolicy: [
      'termsOfServiceURL',
      'privacyPolicyURL',
      'training',
      'retainsPrompts',
      'requiresUserIDs',
      'canPublish',
      'retentionDays',
    ],
  },
}

// oxlint-enable sort-keys

const Atom = z.union([z.null(), z.string(), z.number(), z.boolean(), z.array(z.string())])

const StringSet = z.object({
  changes: z.array(z.object({ type: z.enum(['ADD', 'REMOVE']), value: z.string() })),
  embeddedKey: z.literal('$value'),
})

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

function selectValue(
  input: JsonValue | undefined,
  selection: true | readonly string[],
  path: string,
): FieldValue {
  if (selection === true || input === null || typeof input !== 'object' || Array.isArray(input)) {
    return Atom.parse(input, { error: () => `Unsupported alert value at ${path}` })
  }

  return Object.fromEntries(
    selection.flatMap((key) =>
      Object.hasOwn(input, key)
        ? [
            [
              key,
              Atom.parse(input[key], { error: () => `Unsupported alert value at ${path}.${key}` }),
            ],
          ]
        : [],
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
  node: CapturedChange,
  sourcePath: string[],
): FieldChange[] {
  const path = nativePath(kind, sourcePath)
  const selection = fieldSelection(kind, path)

  if (selection === undefined) {
    return []
  }

  if (node.changes !== undefined) {
    if (selection !== true) {
      // ponytail: indexed arrays in selected object groups silently lose their numeric children.
      // Reject those shapes if they occur upstream; see docs/orca/events.md.
      return node.changes.flatMap((nested) =>
        selectedChanges(kind, nested, [...sourcePath, nested.key]),
      )
    }

    const set = StringSet.parse(node, {
      error: () => `Unsupported array change at ${path.join('.')}`,
    })

    return [
      {
        added: set.changes.filter((item) => item.type === 'ADD').map((item) => item.value),
        path: path.join('.'),
        removed: set.changes.filter((item) => item.type === 'REMOVE').map((item) => item.value),
        type: 'set_updated',
      },
    ]
  }

  const field = path.join('.')

  if (node.type === 'ADD') {
    return [{ after: selectValue(node.value, selection, field), path: field, type: 'field_added' }]
  }

  if (node.type === 'REMOVE') {
    return [
      { before: selectValue(node.value, selection, field), path: field, type: 'field_removed' },
    ]
  }

  const before = selectValue(node.oldValue, selection, field)
  const after = selectValue(node.value, selection, field)

  return isDeepEqual(before, after) ? [] : [{ after, before, path: field, type: 'field_updated' }]
}

interface NativeFields {
  [name: string]: JsonValue
}

function entityValue(snapshot: Snapshot): Record<string, FieldValue> {
  const source: Record<string, JsonValue> = snapshot.value
  const native: NativeFields = { ...snapshot.value.metadata, ...source }

  for (const [key, field] of Object.entries(source)) {
    const [name] = nativePath(snapshot.entity_kind, [key])

    if (name !== undefined) {
      native[name] = field
    }
  }

  if (snapshot.entity_kind === 'endpoint') {
    const { discount, meters } = snapshot.value.pricing
    native.pricing = {
      discount,
      ...meters,
      ...(isScheduledPricing(snapshot.value.pricing) ? { is_scheduled: true } : {}),
    }
  }

  return Object.fromEntries(
    Object.entries(selections[snapshot.entity_kind]).flatMap(([key, selection]) =>
      Object.hasOwn(native, key) ? [[key, selectValue(native[key], selection, key)]] : [],
    ),
  )
}

/** Interpret captured facts only; curation never reads current Catalog or modifies stored events. */
export function curate(row: EventRow): EntityAlert | null {
  const { change_json: _json, type: _type, scan_at, ...subject } = withoutSystemFields(row)
  const identity = { ...subject, observed_at: scan_at }
  const event = decode(row)

  if (event.type === 'ADD') {
    return {
      ...identity,
      after: entityValue(event.after),
      type: `${row.entity_kind}_added`,
    }
  }

  if (event.type === 'REMOVE') {
    return {
      ...identity,
      before: entityValue(event.before),
      type: `${row.entity_kind}_removed`,
    }
  }

  const scheduled =
    event.pricing === undefined
      ? undefined
      : isScheduledPricing(event.pricing.before) || isScheduledPricing(event.pricing.after)

  const changes = event.changes.flatMap<FieldChange>(({ path, change }) => {
    if (
      row.entity_kind === 'endpoint' &&
      scheduled === true &&
      path[0] === 'pricing' &&
      path[1] === 'overrides'
    ) {
      // Override row order has been stable upstream. A reorder intentionally counts as
      // a coarse schedule change; we do not interpret condition equivalence.
      return [{ path: 'pricing.overrides', type: 'field_changed' }]
    }

    return selectedChanges(row.entity_kind, change, path)
  })

  return changes.length === 0
    ? null
    : {
        ...identity,
        changes,
        type: `${row.entity_kind}_updated`,
        ...(scheduled === undefined ? {} : { pricing_is_scheduled: scheduled }),
      }
}
