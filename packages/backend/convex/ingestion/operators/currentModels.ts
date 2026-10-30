import * as R from 'remeda'

import type { ExtractedModel } from '#scans/extraction'

import type { CurrentModelRow } from '../../catalog/tables/current'
import { modelEntity } from '../lenses'
import { deriveCurrent } from './current'
import type { CurrentScope } from './current'
import type { Source } from './source'

const omittedMetadataKeys = [
  'author',
  'author_flagship_modalities',
  'author_icon_uri',
  'context_length',
  'default_order',
  'default_stops',
  'default_system',
  'display_required_attestation_types',
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
] as const

export function derive(source: Source, scope: CurrentScope): CurrentModelRow[] {
  return deriveCurrent(source, scope, (scan) => scan.models, modelRow)
}

/** One model's current row at a version; refreshes reuse it to restate retained rows. */
export function modelRow(model: ExtractedModel, { scan_at }: { scan_at: string }): CurrentModelRow {
  const { metadata, ...fields } = modelEntity(model)

  return {
    ...fields,
    metadata_json: JSON.stringify(R.omit(metadata, omittedMetadataKeys)),
    scan_at,
  }
}
