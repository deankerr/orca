/* oxlint-disable typescript/no-unsafe-type-assertion -- Snapshot tests need only the mocked Objects retrieval seam. */
import { spyOn, test } from 'bun:test'
import { rejects } from 'node:assert/strict'

import type { ActionCtx } from '../../_generated/server'
import * as objects from '../../objects'
import { buildSnapshot } from './snapshot'

test('snapshot rejects missing, mismatched, invalid and empty source data before publication', async () => {
  const scanAt = '2026-10-02T10:40:04.272Z'
  const scanId = `scan.${scanAt}.jsonl`
  const entry = {
    scan_at: scanAt,
    model_id: 'author/model',
    variant: 'standard',
    model: {
      slug: 'author/model',
      permaslug: 'author/model-v1',
      input_modalities: ['text'],
      output_modalities: ['text'],
    },
    endpoints: null,
  }
  const source = spyOn(objects, 'load').mockResolvedValue(null)
  const ctx = {} as ActionCtx

  try {
    await rejects(buildSnapshot(ctx, scanId), /Public API scan missing/)
    source.mockResolvedValue(JSON.stringify({ ...entry, scan_at: '2026-10-02T09:40:04.272Z' }))
    await rejects(buildSnapshot(ctx, scanId), /Public API scan identity mismatch/)
    source.mockResolvedValue(
      JSON.stringify({
        ...entry,
        endpoints: [{ id: 'endpoint', variant: 'standard', model_variant_slug: 'author/model' }],
      }),
    )
    await rejects(buildSnapshot(ctx, scanId))
    for (const endpoints of [null, []]) {
      source.mockResolvedValue(JSON.stringify({ ...entry, endpoints }))
      await rejects(buildSnapshot(ctx, scanId), /Public API scan has no usable endpoints/)
    }
  } finally {
    source.mockRestore()
  }
})
