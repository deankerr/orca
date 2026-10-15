import { v } from 'convex/values'
import * as R from 'remeda'

import { internal } from '#generated/api'
import { internalMutation } from '#generated/server'

import { CURRENT_MODELS_TABLE, currentModelsTable } from '../../catalog/tables/current'
import type { CurrentModelRow } from '../../catalog/tables/current'
import { commitProcess, createIngestor } from '../ingestor'
import type { Ingestor } from '../ingestor'
import { modelEntity } from '../lenses'
import { commitResult } from '../results'

const omittedMetadataKeys = [
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
] as const

export const ingest: Ingestor = createIngestor({
  process: 'currentModels',
  prepare(_ctx, { previous, next, has_later_scan }) {
    const models = has_later_scan ? [] : [...next.models.values()]

    for (const [id, model] of previous.models) {
      if (!next.models.has(id)) {
        models.push(model)
      }
    }

    const rows = models.map((model) => {
      const { metadata, ...fields } = modelEntity(model)
      const row: CurrentModelRow = {
        ...fields,
        scan_at: next.scan_at,
        metadata_json: JSON.stringify(R.omit(metadata, omittedMetadataKeys)),
      }

      return row
    })

    return { scan_at: next.scan_at, rows }
  },
  write: async (ctx, args) =>
    await ctx.runMutation(internal.ingestion.catalog.currentModels.write, args),
})

export const write = internalMutation({
  args: { process: v.string(), scan_at: v.string(), rows: v.array(currentModelsTable.validator) },
  returns: commitResult,
  handler: async (ctx, { rows, scan_at, process }) =>
    await commitProcess(ctx, scan_at, process, async () => {
      for (const row of rows) {
        const existing = await ctx.db
          .query(CURRENT_MODELS_TABLE)
          .withIndex('by_model_id', (q) => q.eq('model_id', row.model_id))
          .unique()

        if (existing !== null && row.scan_at <= existing.scan_at) {
          continue
        }

        await (existing === null
          ? ctx.db.insert(CURRENT_MODELS_TABLE, row)
          : ctx.db.replace(CURRENT_MODELS_TABLE, existing._id, row))
      }
    }),
})
