import { v } from 'convex/values'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'
import type { ActionCtx } from '#generated/server'
import type { ExtractedModel } from '#scans/extraction'

import { CURRENT_MODELS_TABLE, currentModelsTable } from '../catalog/tables/current'
import type { CurrentModelRow } from '../catalog/tables/current'
import { compare } from '../compare'
import type { ScanPair } from './input'
import { modelEntity } from './lenses'
import { commitProcess } from './progress'
import type { RegistrationId } from './table'
import { registrationId } from './table'

export async function ingest(
  ctx: ActionCtx,
  { previous, next }: ScanPair,
  registration_id: RegistrationId,
): Promise<void> {
  const rows: Omit<CurrentModelRow, 'first_scan_at'>[] = []

  for (const [id, model] of next.models) {
    const previousModel = previous.models.get(id)
    const after = currentModel(model)

    if (previousModel !== undefined && compare(currentModel(previousModel), after).length === 0) {
      continue
    }

    const { metadata, ...facts } = after

    rows.push({ ...facts, scan_at: next.scan_at, metadata_json: JSON.stringify(metadata) })
  }

  await ctx.runMutation(internal.ingestion.currentModels.write, { registration_id, rows })
}

export const write = internalMutation({
  args: {
    registration_id: registrationId,
    rows: v.array(currentModelsTable.validator.omit('first_scan_at')),
  },
  returns: v.null(),
  handler: async (ctx, { rows, registration_id }) => {
    await commitProcess(ctx, registration_id, 'currentModels', async () => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(CURRENT_MODELS_TABLE)
          .withIndex('by_model_id', (q) => q.eq('model_id', row.model_id))
          .unique()

        if (existing !== null && row.scan_at <= existing.scan_at) {
          continue
        }

        const next = { ...row, first_scan_at: existing?.first_scan_at ?? row.scan_at }

        await (existing === null
          ? ctx.db.insert(CURRENT_MODELS_TABLE, next)
          : ctx.db.replace(CURRENT_MODELS_TABLE, existing._id, next))
      }
    })

    return null
  },
})

const omittedMetadataKeys = new Set([
  'author',
  'author_flagship_modalities',
  'author_icon_uri',
  'context_length',
  'default_order',
  'default_parameters',
  'default_stops',
  'default_system',
  'display_required_attestation_types',
  'features',
  'group',
  'has_text_output',
  'hf_updated_at',
  'hidden',
  'instruct_type',
  'is_private',
  'is_trainable_image',
  'is_trainable_text',
  'limit_rpd',
  'limit_rpm',
  'model_version_group_id',
  'name',
  'preview_audio',
  'preview_thumbnail_url',
  'previews_by_modality',
  'promotion_message',
  'quick_start_example_type',
  'required_attestation_types',
  'router',
  'routing_error_message',
  'supported_tts_voices',
  'updated_at',
  'variant_deprecation_date',
  'warning_message',
])

export function currentModel(model: ExtractedModel) {
  const { metadata, ...fields } = modelEntity(model)

  return {
    ...fields,
    metadata: Object.fromEntries(
      Object.entries(metadata).filter(([key]) => !omittedMetadataKeys.has(key)),
    ),
  }
}
